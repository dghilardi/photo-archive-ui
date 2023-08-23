import { useEffect, useState } from "react";
import "./App.css";
import Grid from "@mui/material/Unstable_Grid2";
import { Button, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { SaveAlt, Sync, SyncDisabled } from "@mui/icons-material";
import { ArchiveSourceDto, listSources, listenSyncEvents, syncSource } from "./client/commands";

type TaskState = { state: 'idle' } | {
  state: 'scanning' | 'running' | 'completed',
  stored: number,
  skipped: number,
  errors: number,
  total: number,
};

function App() {
  const [sources, setSources] = useState<Array<ArchiveSourceDto>>([]);
  const [taskState, setTaskState] = useState<TaskState>({ running: false });

  useEffect(() => {
    listSources()
      .then(res => setSources(res as Array<ArchiveSourceDto>))
  }, []);

  const importOrSync = async (source: ArchiveSourceDto) => {
    const task = source.registration.state === 'registered'
      ? await syncSource({ sourceId: source.id })
      : await syncSource({ sourceId: source.id });

    setTaskState({ state: 'scanning', stored: 0, skipped: 0, errors: 0, total: 0 });
    listenSyncEvents(task.taskId, (evt) => {
      let isCompleted = !!evt.payload.find(evt => evt.eventType === 'completed');
      let processingEvts = evt.payload.filter(evt => ['stored', 'skipped', 'errored'].includes(evt.eventType));
      let scanEvts = evt.payload.filter(evt => ['scan-complete', 'scan-progress'].includes(evt.eventType));
      const lastScanEvt = scanEvts.pop();

      console.log(`evts: ${evt.payload.length} scan: ${scanEvts.length} proc: ${processingEvts.length}`);
      if (isCompleted) {
        setTaskState(prev => prev.state !== 'idle' ? { ...prev, state: 'completed' } : prev);
      } else {
        setTaskState((prevState) => prevState.state === 'idle' ? prevState
          : {
            state: lastScanEvt?.eventType === 'scan-complete' ? 'running' : prevState.state,
            total: lastScanEvt?.eventType === 'scan-complete' || lastScanEvt?.eventType === 'scan-progress' ? lastScanEvt.count : prevState.total,
            stored: prevState.stored + processingEvts.filter(e => e.eventType === 'stored').length,
            skipped: prevState.skipped + processingEvts.filter(e => e.eventType === 'skipped').length,
            errors: prevState.errors + processingEvts.filter(e => e.eventType === 'errored').length,
          }
        );
      }
    });
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
              disabled={source.connection.state === 'disconnected'}
              endIcon={source.connection.state === 'disconnected' ? <SyncDisabled /> : source.registration.state === 'registered' ? <Sync /> : <SaveAlt />}
            >
              <Typography noWrap>{label}</Typography>
            </Button>
          </Grid>;
        })}
      </Grid>
      {taskState.state === 'running'
        ? <>
          <Typography>Processed: {taskState.stored + taskState.skipped + taskState.errors} / {taskState.total}</Typography>
          <LinearProgress variant="determinate" value={(taskState.stored + taskState.skipped + taskState.errors) * 100.0 / taskState.total} />
          <Stats values={taskState} />
        </>
        : taskState.state === 'scanning'
          ? <>
            <Typography>Processed: {taskState.stored + taskState.skipped + taskState.errors} / {taskState.total}</Typography>
            <LinearProgress variant="indeterminate" />
            <Stats values={taskState} />
          </>
        : taskState.state === 'completed'
          ? <>
            <Stats values={taskState} />
          </>
          : <>
          </>
      }

    </div>
  );
}

const Stats = ({ values }: { values: { stored: number, errors: number, skipped: number } }) => <TableContainer component={Paper}>
  <Table sx={{ minWidth: 650 }} aria-label="simple table">
    <TableHead>
      <TableRow>
        <TableCell>Stats</TableCell>
        <TableCell align="right">Completed</TableCell>
        <TableCell align="right">Skipped</TableCell>
        <TableCell align="right">Errors</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      <TableRow>
        <TableCell>-</TableCell>
        <TableCell align="right">{values.stored}</TableCell>
        <TableCell align="right">{values.skipped}</TableCell>
        <TableCell align="right">{values.errors}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</TableContainer>;

export default App;
