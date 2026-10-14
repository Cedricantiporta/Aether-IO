import { RoomEvents } from './RoomEvents';
import React, { Suspense, useLayoutEffect } from 'react';
import { FacingArrow } from './FacingArrow';
import { useFrame } from '@react-three/fiber';
import { updateGame } from '../engine/game';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { useQuality } from './quality';
import { Sky, Lighting, FOG_COLOR } from './Sky';
import { LookDriver, setLook } from './biomeLook';
import { Room } from './Room';
import { GuideArrow } from './GuideArrow';
import { CameraRig } from './CameraRig';
import { Terrain } from './Terrain';
import { Props } from './Props';
import { Town } from './Town';
import { CastleInterior } from './CastleInterior';
import { Hero } from './Hero';
import { Enemies } from './Enemies';
import { Bosses } from './Bosses';
import { Bosses2 } from './Bosses2';
import { BossFx } from './BossFx';
import { Projectiles } from './Projectiles';
import { Zones } from './Zones';
import { GroundFx } from './GroundFx';
import { AimIndicator } from './AimIndicator';
import { TargetRing } from './TargetRing';
import { TrickFx, CrystalWalls } from './TrickFx';
import { Pickups } from './Pickups';
import { Crates } from './Crates';
import { Pet } from './Pet';
import { VFX, HaloLayer } from './VFX';
import { DamageNumbers } from './DamageNumbers';
import { useWorldCounter } from './hooks';
import { world } from '../engine/world';

export function Scene() {
  const q = useQuality();
  const status = useGameStore((s) => s.status);
  const ver = useWorldCounter(() => world.obstaclesVersion);
  const area = useWorldCounter(() => world.village.areaVer);
  void area;
  const roomVer = useWorldCounter(() => world.room.version);
  useFrame((_, dt) => updateGame(dt), -1);
  const gameplay = status !== GameStatus.MENU && status !== GameStatus.HERO_SELECT;
  // town while in the menu / hero select; a run shows only its current room (rebuilt behind the black fade)
  useLayoutEffect(() => { setLook(gameplay ? world.room.biome : -1, true); }, [gameplay, roomVer]);
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 75, 210]} />
      <Sky q={q} />
      <Lighting q={q} />
      <LookDriver />
      <CameraRig />
      {gameplay ? <Room q={q} /> : world.village.area === 'CASTLE' ? (
        <Suspense fallback={null}><CastleInterior q={q} /></Suspense>
      ) : (
        <>
          <Suspense fallback={null}><Terrain key={q.name + ':' + ver} q={q} /></Suspense>
          <Suspense fallback={null}><Props q={q} /></Suspense>
          <Suspense fallback={null}><Town q={q} /></Suspense>
        </>
      )}
      <Suspense fallback={null}><Hero q={q} /></Suspense>
      <FacingArrow />
      {!gameplay && <GuideArrow />}
      {(gameplay || (status === GameStatus.MENU && world.village.area === 'TOWN')) && (
        <>
          <Crates />
          <Pickups />
        </>
      )}
      {!gameplay && status === GameStatus.MENU && world.village.area === 'TOWN' && (
        <>{/* town: skills / attacks and the hermit-path monsters */}
          <Zones />
          <GroundFx />
          <Enemies />
          <Projectiles />
          <Pet />
        </>
      )}
      {gameplay && (
        <>
          <Zones />
          <GroundFx />
          <AimIndicator />
          <TargetRing />
          <TrickFx />
          <CrystalWalls />
          <Enemies />
          <Bosses />
          <Bosses2 />
          <BossFx />
          <RoomEvents />
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
