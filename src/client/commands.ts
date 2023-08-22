import { invoke } from "@tauri-apps/api";
import { EventCallback } from "@tauri-apps/api/event";
import { appWindow } from '@tauri-apps/api/window'

export interface ArchiveSourceDto {
    id: string,
    registration: { state: 'unregistered' } | {
        state: 'registered',
        name: string,
        group: string,
    },
    connection: { state: 'disconnected' } | {
        state: 'connected',
        mountPoint: string,
    },
}

export const listSources = async () => await invoke('list_sources') as Array<ArchiveSourceDto>;

export interface RunningTaskDto {
    taskId: string,
}

interface SyncSourceDto {
    sourceId: string,
}

export const syncSource = async (args: SyncSourceDto) => await invoke('sync_source', { args }) as RunningTaskDto;

interface ImportSourceDto {
    sourceId: string,
    sourceName: string,
    sourceGroup: string,
    sourceTags: string[],
}

export const importSource = async (args: ImportSourceDto) => await invoke('import_source', { args }) as RunningTaskDto;

export const listenEvents = async <T>(source: string, handler: EventCallback<T>) => await appWindow.listen(source, handler);

export type SyncEvent = { evtType: 'completed' }
 | { evtType: 'stored',  src: string, dst: string, generated: boolean }
 | { evtType: 'skipped',  src: string, existing: string }
 | { evtType: 'errored',  src: string, cause: string };

export const listenSyncEvents = listenEvents<SyncEvent[]>;