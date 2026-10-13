import React, { Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { updateGame } from '../engine/game';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { useQuality } from './quality';
import { Sky, Lighting, FOG_COLOR } from './Sky';
import { CameraRig } from './CameraRig';
import { Terrain } from './Terrain';
import { Props, Campfire } from './Props';
import { Town } from './Town';
import { Hero } from './Hero';
import { Enemies } from './Enemies';
import { Bosses } from './Bosses';
import { Bosses2 } from './Bosses2';
import { BossFx } from './BossFx';
import { Projectiles } from './Projectiles';
import { Zones } from './Zones';
import { GroundFx } from './GroundFx';
import { AimIndicator } from './AimIndicator';
import { TrickFx, CrystalWalls } from './TrickFx';
import { Pickups } from './Pickups';
import { Crates } from './Crates';
import { Pet } from './Pet';
import { VFX, HaloLayer } from './VFX';
import { DamageNumbers } from './DamageNumbers';
import { useObstaclesVersion } from './hooks';

export function Scene() {
  const q = useQuality();
  const status = useGameStore((s) => s.status);
  const ver = useObstaclesVersion();
  useFrame((_, dt) => updateGame(dt), -1);
  const gameplay = status !== GameStatus.MENU && status !== GameStatus.HERO_SELECT;
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 75, 210]} />
      <Sky q={q} />
      <Lighting q={q} />
      <CameraRig />
      <Suspense fallback={null}><Terrain key={q.name + ':' + ver} q={q} /></Suspense>
      <Suspense fallback={null}><Props q={q} /></Suspense>
      <Campfire q={q} />
      <Suspense fallback={null}><Town q={q} /></Suspense>
      <Suspense fallback={null}><Hero q={q} /></Suspense>
      {(gameplay || status === GameStatus.MENU) && (
        <>
          <Crates />
          <Pickups />
        </>
      )}
      {gameplay && (
        <>
          <Zones />
          <GroundFx />
          <AimIndicator />
          <TrickFx />
          <CrystalWalls />
          <Enemies />
          <Bosses />
          <Bosses2 />
          <BossFx />
          <Projectiles />
          <Pet />
        </>
      )}
      <VFX />
      <DamageNumbers />
      <HaloLayer />
    </>
  );
}
