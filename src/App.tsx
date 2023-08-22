import { useEffect, useState } from "react";
import "./App.css";
import Grid from "@mui/material/Unstable_Grid2";
import { Button, Typography } from "@mui/material";
import { SaveAlt, Sync, SyncDisabled } from "@mui/icons-material";
import { ArchiveSourceDto, listSources, listenSyncEvents, syncSource } from "./client/commands";

type TaskState = { running: false } | {
  running: true,
  processed: number,
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

    setTaskState({ running: true, processed: 0 });
    listenSyncEvents(task.taskId, (evt) => {
      console.log(evt.payload);
      if (evt.payload[0].evtType === 'completed') {
        setTaskState({ running: false });
      } else {
        setTaskState((prevState) => prevState.running ? { ...prevState, processed: prevState.processed + evt.payload.length } : prevState);
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
      {taskState.running
        ? <Typography>Processed: {taskState.processed}</Typography>
        : <div />
      }
    </div>
  );
}

export default App;
