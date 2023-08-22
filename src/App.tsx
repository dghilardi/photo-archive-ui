import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import Grid from "@mui/material/Unstable_Grid2";
import { Button, Card, Typography } from "@mui/material";
import { SaveAlt, Sync, SyncDisabled } from "@mui/icons-material";

interface ArchiveSourceDto {
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

function App() {
  const [sources, setSources] = useState<Array<ArchiveSourceDto>>([]);

  useEffect(() => {
    invoke('list_sources')
      .then(res => {
        console.log(res);
        setSources(res as Array<ArchiveSourceDto>)
      })
  }, [])

  return (
    <div className="container">
      <h1>Welcome to Photo Archive!</h1>

      <Grid container spacing={2}>
        {sources.map(source => {
          const label = source.registration.state === 'registered' ? source.registration.name 
            : source.connection.state === 'connected' ? source.connection.mountPoint 
            : source.id;
          
          return <Grid key={source.id} xs={4}>
            <Button variant="outlined" fullWidth endIcon={source.connection.state === 'disconnected' ? <SyncDisabled /> : source.registration.state === 'registered' ? <Sync /> : <SaveAlt />}>
              <Typography noWrap>{label}</Typography>
            </Button>
          </Grid>;
        })}
      </Grid>
    </div>
  );
}

export default App;
