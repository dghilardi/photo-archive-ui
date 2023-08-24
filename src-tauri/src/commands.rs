use std::collections::{HashMap, HashSet};
use std::fs::create_dir_all;
use std::ops::Add;
use std::path::PathBuf;
use std::{iter, thread};
use std::time::{Duration, SystemTime};
use anyhow::{anyhow, Context};
use photo_archive::archive::sync::{SynchronizationEvent, synchronize_source, SyncOpts, SyncrhonizationTask, SyncSource};
use photo_archive::common::fs::{list_mounted_partitions, partition_by_id};
use photo_archive::repository::sources::SourcesRepo;
use serde::{Deserialize, Serialize};
use tauri::{State, Window};
use uuid::Uuid;
use crate::common;
use crate::state::PhotoArchiveState;


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSource {
    id: String,
    registration: RegistrationState,
    connection: ConnectionState,
}

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum RegistrationState {
    Registered { name: String, group: String },
    Unregistered,
}

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum ConnectionState {
    #[serde(rename_all = "camelCase")]
    Connected { mount_point: PathBuf },
    Disconnected,
}

#[tauri::command]
pub fn list_sources(state: State<PhotoArchiveState>) -> common::Result<Vec<ArchiveSource>> {
    let archive_dir = { state.archive_path.lock().expect("Error reading archive path") }.clone();
    let repo = SourcesRepo::new(archive_dir);
    let mut registered_sources = repo.all()?
        .into_iter()
        .map(|source| (source.id.clone(), source))
        .collect::<HashMap<_, _>>();

    let mounted_partitions = list_mounted_partitions()
        .context("Error reading partitions")?;

    let source_id_count = mounted_partitions.iter()
        .fold(HashMap::new(), |mut acc, item| {
            *acc.entry(item.info.partition_id.clone()).or_insert(0) += 1;
            acc
        });

    let mut sources = mounted_partitions
        .into_iter()
        .filter(|source| source_id_count.get(&source.info.partition_id).cloned().unwrap_or(0) == 1)
        .map(|mount| ArchiveSource {
            registration: registered_sources.remove(&mount.info.partition_id)
                .map(|source| RegistrationState::Registered { name: source.name, group: source.group })
                .unwrap_or(RegistrationState::Unregistered),
            connection: ConnectionState::Connected { mount_point: mount.mount_point },
            id: mount.info.partition_id,
        })
        .collect::<Vec<_>>();

    sources.extend(
        registered_sources.drain().map(|(_, source)| ArchiveSource {
            registration: RegistrationState::Registered { name: source.name, group: source.group },
            connection: ConnectionState::Disconnected,
            id: source.id,
        })
    );

    Ok(sources)
}

#[tauri::command]
pub fn list_groups(state: State<PhotoArchiveState>) -> common::Result<HashSet<String>> {
    let archive_dir = { state.archive_path.lock().expect("Error reading archive path") }.clone();
    let repo = SourcesRepo::new(archive_dir);
    let groups = repo.all()?
        .into_iter()
        .map(|source| source.group)
        .chain(iter::once(String::from("ROOT")))
        .collect::<HashSet<_>>();

    Ok(groups)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceArgs {
    pub source_id: String,
    pub source_name: String,
    pub source_group: String,
    pub source_tags: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "eventType", rename_all = "kebab-case")]
pub enum SynchronizationEventJson {
    Stored { src: PathBuf, dst: PathBuf, generated: bool },
    Skipped { src: PathBuf, existing: PathBuf },
    Errored { src: PathBuf, cause: String },
    ScanProgress { count: u64 },
    ScanComplete { count: u64 },
    Completed,
}

impl From<SynchronizationEvent> for SynchronizationEventJson {
    fn from(value: SynchronizationEvent) -> Self {
        match value {
            SynchronizationEvent::Stored { src, dst, generated } => Self::Stored { src, dst, generated },
            SynchronizationEvent::Skipped { src, existing } => Self::Skipped { src, existing },
            SynchronizationEvent::Errored { src, cause } => Self::Errored { src, cause },
            SynchronizationEvent::ScanProgress { count } => Self::ScanProgress { count },
            SynchronizationEvent::ScanCompleted { count } => Self::ScanComplete { count },
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningTaskDto {
    task_id: String,
}

#[tauri::command]
pub fn import_source(window: Window, state: State<PhotoArchiveState>, args: ImportSourceArgs) -> common::Result<RunningTaskDto> {
    let archive_dir = { state.archive_path.lock().expect("Error reading archive path") }.clone();
    if !archive_dir.exists() {
        create_dir_all(&archive_dir)
            .context("Error during target dir creation")?;
    } else if !archive_dir.is_dir() {
        return Err(anyhow!("Target path is not a directory").into());
    }

    let task = synchronize_source(SyncOpts {
        count_images: true,
        source: SyncSource::New {
            id: args.source_id,
            name: args.source_name,
            group: args.source_group,
            tags: args.source_tags,
        },
    }, &archive_dir)?;

    let task_id = format!("import-source-{}", Uuid::new_v4());
    let out = RunningTaskDto {
        task_id: task_id.clone()
    };

    thread::spawn(move || process_evt_stream(&window, &task_id, task));

    Ok(out)
}

fn process_evt_stream(window: &Window, task_id: &str, task: SyncrhonizationTask) {
    let mut buffer = Vec::new();
    let mut last_sent = SystemTime::now();
    
    while let Ok(evt) = task.evt_stream().recv() {
        buffer.push(SynchronizationEventJson::from(evt));
        if last_sent.add(Duration::from_millis(500)) < SystemTime::now() {
            let emit_out = window.emit(task_id, buffer.drain(..).collect::<Vec<_>>());
            last_sent = SystemTime::now();
            if let Err(err) = emit_out {
                eprintln!("Error emitting event - {err}");
            }
        }
    }

    let join_out = task.join();
    if let Err(err) = join_out {
        eprintln!("Error joining worker threads - {err}");
    }
    if let Ok(dur) = last_sent.add(Duration::from_millis(500)).duration_since(SystemTime::now()) {
        thread::sleep(dur);
    }
    buffer.push(SynchronizationEventJson::Completed);

    let emit_out = window.emit(&task_id, buffer);
    if let Err(err) = emit_out {
        eprintln!("Error emitting event - {err}");
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSourceArgs {
    pub source_id: String,
}

#[tauri::command]
pub fn sync_source(window: Window, state: State<PhotoArchiveState>, args: SyncSourceArgs) -> common::Result<RunningTaskDto> {
    let archive_dir = { state.archive_path.lock().expect("Error reading archive path") }.clone();
    if !archive_dir.exists() {
        create_dir_all(&archive_dir)
            .context("Error during target dir creation")?;
    } else if !archive_dir.is_dir() {
        return Err(anyhow!("Target path is not a directory").into());
    }

    let task = synchronize_source(SyncOpts {
        count_images: true,
        source: SyncSource::Existing {
            id: args.source_id,
        },
    }, &archive_dir)?;

    let task_id = format!("sync-source-{}", Uuid::new_v4());
    let out = RunningTaskDto {
        task_id: task_id.clone()
    };

    thread::spawn(move || process_evt_stream(&window, &task_id, task));

    Ok(out)
}

