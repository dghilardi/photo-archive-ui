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

export const listGroups = async () => await invoke('list_groups') as Array<string>;

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

export type SyncEvent = { eventType: 'completed' }
 | { eventType: 'stored',  src: string, dst: string, generated: boolean }
 | { eventType: 'skipped',  src: string, existing: string }
 | { eventType: 'errored',  src: string, cause: string }
 | { eventType: 'scan-progress', count: number }
 | { eventType: 'scan-complete', count: number };

export const listenSyncEvents = listenEvents<SyncEvent[]>;