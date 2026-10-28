import { HomeInterior } from './HomeInterior';
import { RoomEvents } from './RoomEvents';
import { BiomeHazards } from './BiomeHazards';
import { VoidFx } from './VoidFx';
import { BossPhaseFx } from './BossPhaseFx';
import { RoomTraps } from './RoomTraps';
import { GiantBosses } from './GiantBosses';
import { Minions } from './Minions';
import React, { Suspense, useEffect, useLayoutEffect } from 'react';
import { FacingArrow } from './FacingArrow';
import { useFrame } from '@react-three/fiber';
import { updateGame } from '../engine/game';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { useQuality } from './quality';
import { Sky, Lighting, FOG_COLOR } from './Sky';
import { LookDriver, setLook } from './biomeLook';
import { DreamGarden } from './DreamGarden';
import { Room } from './Room';
import { GuideArrow } from './GuideArrow';
import { StationaryArrow } from './StationaryArrow';
import { ClickMarker } from './ClickMarker';
import { CameraRig } from './CameraRig';
import { Terrain } from './Terrain';
import { Props } from './Props';
import { Town } from './Town';
import { Fireflies, RunFireflies } from './Fireflies';
import { ChurchInterior } from './ChurchInterior';
import { TavernInterior } from './TavernInterior';
import { CastleInterior } from './CastleInterior';
import { CaveInterior } from './CaveInterior';
import { CaveEntrance } from './CaveEntrance';
import { caveLayout } from '../engine/caveData';
import { Hero } from './Hero';
import { RemoteHero } from './RemoteHero';
import { ReviveRing } from './ReviveRing';
import { Enemies } from './Enemies';
import { Bosses } from './Bosses';
import { Bosses2 } from './Bosses2';
import { DarkHeroes } from './DarkHero';
import { HumanBosses } from './HumanBosses';
import { BossFx } from './BossFx';
import { Projectiles } from './Projectiles';
import { Zones } from './Zones';
import { GroundFx } from './GroundFx';
import { AimIndicator } from './AimIndicator';
import { RangeRing } from './RangeRing';
import { EnemyGuide } from './EnemyGuide';
import { TargetRing } from './TargetRing';
import { TrickFx, CrystalWalls } from './TrickFx';
import { Pickups } from './Pickups';
import { Crates } from './Crates';
import { Pet, GhostPet } from './Pet';
import { VFX, HaloLayer } from './VFX';
import { DamageNumbers } from './DamageNumbers';
import { StatusFx } from './StatusFx';
import { useWorldCounter } from './hooks';
import { world } from '../engine/world';
import { poolWarm } from './util';

/**
 * Empty effect pools are hidden (render/util `commitInst`); keep them drawn for a few frames whenever the scene / room /
 * area / quality changes so their shaders compile behind the room fade, with the room's real lights, as before.
 */
function ShaderWarmup({ k }: { k: string }) {
  useEffect(() => { poolWarm.frames = 4; }, [k]);
  useFrame(() => { if (poolWarm.frames > 0) poolWarm.frames--; });
  return null;
}

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
  const cave = !gameplay && world.village.area === 'CAVE';
  const cv = world.village.cave, hz = cave ? caveLayout(cv.floor, cv.seed).hazard : 'NONE';
  const look = gameplay ? world.room.biome : !cave ? -1 : hz === 'LAVA' ? -3 : hz === 'POISON' ? -4 : -2;   // (cave floors: lava / poison looks)
  useLayoutEffect(() => { setLook(look, true, world.room.index); }, [gameplay, roomVer, look]);
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 75, 210]} />
      <Sky q={q} />
      <Lighting q={q} />
      <LookDriver />
      <CameraRig />
      <ClickMarker />
      <ShaderWarmup k={`${q.name}:${gameplay}:${roomVer}:${world.village.area}`} />
      {gameplay ? <><Room q={q} /><DreamGarden /><RunFireflies q={q} /></> : world.village.area === 'HOME' ? (
        <Suspense fallback={null}><HomeInterior q={q} /></Suspense>
      ) : world.village.area === 'TAVERN' ? (
        <Suspense fallback={null}><TavernInterior q={q} /></Suspense>
      ) : world.village.area === 'CHURCH' ? (
        <Suspense fallback={null}><ChurchInterior q={q} /></Suspense>
      ) : world.village.area === 'CASTLE' ? (
        <Suspense fallback={null}><CastleInterior q={q} /></Suspense>
      ) : cave ? (
        <Suspense fallback={null}><CaveInterior key={cv.floor + ':' + cv.seed} q={q} /></Suspense>
      ) : (
        <>
          <Suspense fallback={null}><Terrain key={q.name + ':' + ver} q={q} /></Suspense>
          <Suspense fallback={null}><Props q={q} /></Suspense>
          <Suspense fallback={null}><Town q={q} /></Suspense>
          <CaveEntrance q={q} />
          <Fireflies q={q} />
        </>
      )}
      <Suspense fallback={null}><Hero q={q} /></Suspense>
      {gameplay && <Suspense fallback={null}><RemoteHero /></Suspense>}   {/* online co-op partner (net/coop.ts) */}
      {gameplay && <ReviveRing />}   {/* co-op: the revive ring round a downed hero */}
      <FacingArrow />
      {!gameplay && <GuideArrow />}
      {gameplay && <StationaryArrow />}
      {(gameplay || (status === GameStatus.MENU && world.village.area !== 'CASTLE' && world.village.area !== 'CHURCH' && world.village.area !== 'TAVERN')) && (
        <>
          <Crates />
          <Pickups />
        </>
      )}
      {!gameplay && status === GameStatus.MENU && world.village.area !== 'CASTLE' && world.village.area !== 'CHURCH' && world.village.area !== 'TAVERN' && world.village.area !== 'HOME' && (
        <>{/* town / crystal cave: skills / attacks, the hermit-path monsters and the cave monsters */}
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
          <RangeRing />
          <EnemyGuide />
          <TrickFx />
          <CrystalWalls />
          <Enemies />
          <Bosses />
          <Bosses2 />
          <GiantBosses />
          <DarkHeroes />
          <HumanBosses />
          <BossFx />
          <RoomEvents />
          <BiomeHazards />
          <VoidFx />
          <BossPhaseFx />
          <RoomTraps />
          <Minions />
          <Minions pool={world.ghostMinions} ghost />
          <Projectiles />
          <Pet />
          <GhostPet />
        </>
      )}
      <VFX />
      <DamageNumbers />
      <StatusFx />
      <HaloLayer />
    </>
  );
}
