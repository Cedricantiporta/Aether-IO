import React, { useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './ui/GameUI';
import { installInput } from './engine/input';
import { initAudio } from './engine/audio';

function App() {
  useEffect(() => installInput(), []);
  useEffect(() => initAudio(), []);
  return (
    <div className="relative w-full h-screen bg-neutral-950 overflow-hidden">
      <GameCanvas />
      <GameUI />
    </div>
  );
}

export default App;
