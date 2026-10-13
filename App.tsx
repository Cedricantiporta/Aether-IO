import React, { useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './ui/GameUI';
import { installInput } from './engine/input';
import { initAudio } from './engine/audio';
import { installLayout } from './ui/layout';
import { LoadingScreen } from './ui/screens/LoadingScreen';

function App() {
  useEffect(() => installInput(), []);
  useEffect(() => initAudio(), []);
  useEffect(() => installLayout(), []);
  return (
    <div className="relative w-full bg-neutral-950 overflow-hidden" style={{ height: '100dvh', touchAction: 'none' }}>
      <GameCanvas />
      <GameUI />
      <LoadingScreen />
    </div>
  );
}

export default App;
