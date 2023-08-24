import { useEffect, useState } from "react";
import "./App.css";
import Grid from "@mui/material/Unstable_Grid2";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { SaveAlt, Sync, SyncDisabled } from "@mui/icons-material";
import { ArchiveSourceDto, SyncEvent, importSource, listGroups, listSources, listenSyncEvents, syncSource } from "./client/commands";
import { EventCallback } from "@tauri-apps/api/event";

type TaskState = { state: 'idle' } | {
  state: 'scanning' | 'running' | 'completed',
  metrics: { [key: string]: number }
  total: number,
};

function App() {
  const [sources, setSources] = useState<Array<ArchiveSourceDto>>([]);
  const [taskState, setTaskState] = useState<TaskState>({ state: 'idle' });
  const [selectedSource, setSelectedSource] = useState<ArchiveSourceDto | undefined>();

  useEffect(() => {
    listSources()
      .then(res => setSources(res as Array<ArchiveSourceDto>))
  }, []);

  const syncEventsListener: EventCallback<SyncEvent[]> = (evt) => {
    let isCompleted = !!evt.payload.find(evt => evt.eventType === 'completed');
    let processingEvts = evt.payload.filter(evt => ['stored', 'skipped', 'errored'].includes(evt.eventType));
    let scanEvts = evt.payload.filter(evt => ['scan-complete', 'scan-progress'].includes(evt.eventType));

    console.log(`evts: ${evt.payload.length} scan: ${scanEvts.length} proc: ${processingEvts.length}`);

    const lastScanEvt = scanEvts.pop();


    setTaskState((prevState) => prevState.state === 'idle' ? prevState
      : {
        state: isCompleted ? 'completed' : lastScanEvt?.eventType === 'scan-complete' ? 'running' : prevState.state,
        total: lastScanEvt?.eventType === 'scan-complete' || lastScanEvt?.eventType === 'scan-progress' ? lastScanEvt.count : prevState.total,
        metrics: Object.fromEntries(
          [
            { name: 'Stored', filter: (evt: SyncEvent) => evt.eventType === 'stored' },
            { name: 'Skipped', filter: (evt: SyncEvent) => evt.eventType === 'skipped' },
            { name: 'Errors', filter: (evt: SyncEvent) => evt.eventType === 'errored' }
          ].map(e => [e.name, (prevState.metrics[e.name] || 0) + processingEvts.filter(e.filter).length])
        )
      }
    );
  };

  const importOrSync = async (source: ArchiveSourceDto) => {
    if (source.registration.state === 'registered') {
      let task = await syncSource({ sourceId: source.id });

      setTaskState({ state: 'scanning', metrics: {}, total: 0 });
      listenSyncEvents(task.taskId, syncEventsListener);
    } else {
      setSelectedSource(source);
    }
  };

  return (
    <div className="container">
      <h1>Welcome to Photo Archive!</h1>

      <Grid container spacing={2}>
        {sources.map(source => {
          const label = source.registration.state === 'registered' ? source.registration.name
            : source.connection.state === 'connected' ? source.connection.mountPoint
              : source.id;

          return <Grid key={source.id} xs={4}>
            <Button
              variant="outlined"
              onClick={() => importOrSync(source)}
              fullWidth
              disabled={['running', 'scanning'].includes(taskState.state) || source.connection.state === 'disconnected'}
              endIcon={source.connection.state === 'disconnected' ? <SyncDisabled /> : source.registration.state === 'registered' ? <Sync /> : <SaveAlt />}
            >
              <Typography noWrap>{label}</Typography>
            </Button>
          </Grid>;
        })}
      </Grid>
      {taskState.state === 'running'
        ? <>
          <Typography>Processed: {Object.entries(taskState.metrics).reduce((acc, [_k, v]) => acc + v, 0)} / {taskState.total}</Typography>
          <LinearProgress variant="determinate" value={Object.entries(taskState.metrics).reduce((acc, [_k, v]) => acc + v, 0) * 100.0 / taskState.total} />
          <Stats values={taskState.metrics} />
        </>
        : taskState.state === 'scanning'
          ? <>
            <Typography>Processed: {Object.entries(taskState.metrics).reduce((acc, [_k, v]) => acc + v, 0)} / {taskState.total}</Typography>
            <LinearProgress variant="indeterminate" />
            <Stats values={taskState.metrics} />
          </>
          : taskState.state === 'completed'
            ? <>
              <Stats values={taskState.metrics} />
            </>
            : <>
            </>
      }
      <ImportDialogModal
        source={selectedSource}
        onAbort={() => setSelectedSource(undefined)}
        onSubmit={async ({ name, group }) => {
          setSelectedSource(undefined);
          let task = await importSource({ sourceId: selectedSource?.id || '', sourceName: name, sourceGroup: group, sourceTags: [] });
          setTaskState({ state: 'scanning', metrics: {}, total: 0 });
          listenSyncEvents(task.taskId, syncEventsListener);
        }}
      />
    </div>
  );
}

const Stats = ({ values }: { values: { [key: string]: number } }) => <TableContainer component={Paper}>
  <Table sx={{ minWidth: 650 }} aria-label="simple table">
    <TableHead>
      <TableRow>
        <TableCell>Stats</TableCell>
        {Object.keys(values).map(k => <TableCell key={k} align="right">{k}</TableCell>)}
      </TableRow>
    </TableHead>
    <TableBody>
      <TableRow>
        <TableCell>-</TableCell>
        {Object.entries(values).map(([k, v]) => <TableCell key={k} align="right">{v}</TableCell>)}
      </TableRow>
    </TableBody>
  </Table>
</TableContainer>;

type FormSubmitEventHandler<T = {}> = (data: T) => void;

type ImportDialogModalArgs = {
  source?: ArchiveSourceDto,
  onSubmit?: FormSubmitEventHandler<{ name: string, group: string }> | undefined,
  onAbort?: React.MouseEventHandler<HTMLButtonElement> | undefined,
};

const ImportDialogModal = ({ source, onSubmit, onAbort }: ImportDialogModalArgs) => {
  const [name, setName] = useState(!!source ? 'a' : 'b');
  const [group, setGroup] = useState('ROOT');
  const [registeredGroups, setRegisteredGroups] = useState<string[]>([]);

  useEffect(() => {
    const defaultName = source?.connection.state === 'connected' ? source.connection.mountPoint.split('/').reverse()[0] : '-';
    setName(defaultName);
    setGroup('ROOT');
  }, [source]);

  useEffect(() => {
    listGroups()
      .then(groups => setRegisteredGroups(groups))
  }, [source]);

  return <Dialog
    open={!!source}
  >
    <DialogTitle>Import source</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Fill the form to register the selected source in your archive
      </DialogContentText>
      <form autoComplete="off">
        <TextField
          autoFocus
          margin="dense"
          id="name"
          label="Name"
          required
          variant="outlined"
          fullWidth
          value={name}
          onChange={e => setName(e.target.value)}
        ></TextField>

        <GroupSelect 
          groups={registeredGroups} 
          value={group}
          onChange={e => setGroup(e.target.value)}
        />

        <DialogActions>
          <Button onClick={onAbort}>Cancel</Button>
          <Button onClick={() => onSubmit ? onSubmit({ name, group }) : undefined}>Import</Button>
        </DialogActions>
      </form>
    </DialogContent>
  </Dialog>;
}

function GroupSelect({ groups, value, onChange }: { groups: string[], value?: string, onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> }) {
  return (<Autocomplete
    freeSolo
    id="group-select-combo"
    disableClearable
    options={groups}
    renderInput={(params) => (
      <TextField
        {...params}
        label="Group"
        margin="dense"
        required
        variant="outlined"
        value={value}
        onChange={onChange}
      />
    )}
  />);
}
export default App;
