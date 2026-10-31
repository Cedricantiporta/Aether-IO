// Visuals of the boss signature mechanics (engine/systems/bossKitHydra.ts + bossKitColossus.ts). Reads only synced state so a co-op guest sees the same:
//  - Tide Hydra 'Heads of the Hydra': `bp` kind HEADS (on / immune), the spare heads are ordinary enemies (pattern >= 5). While the body is EXPOSED
//    (bp.on, !bp.immune) a pulsing gold-white aura wraps it and sparks rise; the live spare heads wear a floating gold ring (the targets).
//  - Dune Colossus 'Overheat Core': the enemy is the BOSS_WARMACH in state ATTACK with pattern 1 (the vent): a glowing core sphere + halo sits on its BACK
//    (opposite the facing) with steam puffs. Trick events 'KIT_EXPOSE|1/0' and 'KIT_CORE|1/0' only add one-off bursts.
// No allocation per frame (fixed meshes, module scratch).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three';
import { world } from '../engine/world';
import { events } from '../engine/events';
import { bp } from '../engine/systems/bossPhaseState';
import { flashStar, glowPuff, ringBurst, smokePuff, sparks } from './fx';

const M_VENT = 1, SPARE0 = 5, MAXH = 3;

export function BossKitFx() {
  const aura = useRef<Mesh>(null!), core = useRef<Mesh>(null!), halo = useRef<Mesh>(null!), heads = useRef<Group>(null!);
  const sph = useMemo(() => new SphereGeometry(1, 20, 14), []);
  const ring = useMemo(() => new RingGeometry(0.8, 1, 36), []);
  const mAura = useMemo(() => new MeshBasicMaterial({ color: 0xffd77a, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), []);
  const mCore = useMemo(() => new MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), []);
  const mHalo = useMemo(() => new MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false }), []);
  const mHead = useMemo(() => new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false }), []);

  useEffect(() => {
    const off = events.on('trick', (e) => {
      const k = e.kind;
      if (k.charCodeAt(0) !== 75 || !k.startsWith('KIT_')) return;
      const p = e.pos, on = k.endsWith('|1');
      if (k.startsWith('KIT_EXPOSE')) {
        if (on) { ringBurst(p.x, 0.5, p.z, 0xffe08a, 2, e.radius * 2.4, 0.7, 2.4); flashStar(p.x, 3.5, p.z, 0xffffff, e.radius * 1.4, 0.4); sparks(p.x, 3, p.z, 26, 0xffe08a, 11, 0.3, 0.7, 2); }
        else ringBurst(p.x, 0.5, p.z, 0x93c5fd, e.radius * 2, 2, 0.5, 1.6);
      } else if (k.startsWith('KIT_CORE')) {
        if (on) { ringBurst(p.x, 0.5, p.z, 0xffa040, 2, e.radius * 3, 0.8, 2.4); smokePuff(p.x, 3, p.z, 22, 0xe8e0d0, 3.4, 1.4, 2.4, e.radius * 0.9, 0.55); flashStar(p.x, 4, p.z, 0xfff0c0, e.radius * 1.2, 0.35); }
        else smokePuff(p.x, 3, p.z, 8, 0x9ca3af, 2.6, 1.0, 1.4, e.radius * 0.6, 0.4);
      }
    });
    return () => { off(); };
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const T = clock.elapsedTime, dt = Math.min(0.05, dtRaw);
    // ---- Hydra: exposed body + spare head markers
    const hOn = bp.on && bp.kind === 'HEADS';
    const body = hOn ? world.enemies[bp.id] : null;
    const exposed = !!body && body.active && !bp.immune;
    aura.current.visible = exposed;
    if (exposed && body) {
      const r = body.radius * (1.55 + 0.12 * Math.sin(T * 9));
      aura.current.position.set(body.pos.x, body.radius * 0.7, body.pos.z); aura.current.scale.setScalar(r);
      mAura.opacity = 0.26 + 0.12 * Math.sin(T * 12);
      if (dt > 0 && Math.random() < dt * 18) sparks(body.pos.x + (Math.random() - 0.5) * body.radius * 1.4, body.radius * 0.6, body.pos.z + (Math.random() - 0.5) * body.radius * 1.4, 2, 0xffe08a, 5, 0.22, 0.8, 1.4, 0, 1, 0);
    }
    const hs = heads.current; let n = 0;
    if (hOn) {
      const L = world.enemies;
      for (let i = 0; i < L.length && n < MAXH; i++) {
        const h = L[i];
        if (!h.active || h.kind !== 'BOSS_HYDRA_HEAD' || h.pattern < SPARE0 || h.state === 'DYING') continue;
        const m = hs.children[n++] as Mesh;
        m.visible = true; m.position.set(h.pos.x, 0.35, h.pos.z); m.scale.setScalar(h.radius * (1.7 + 0.2 * Math.sin(T * 6 + n)));
        m.rotation.x = -Math.PI / 2;
      }
    }
    for (let i = n; i < MAXH; i++) hs.children[i].visible = false;
    // ---- Colossus: the exposed back core
    let wm = null;
    const L = world.enemies;
    if (!hOn && world.boss.active) for (let i = 0; i < L.length; i++) { const x = L[i]; if (x.active && x.kind === 'BOSS_WARMACH' && x.boss && x.state === 'ATTACK' && x.pattern === M_VENT) { wm = x; break; } }
    core.current.visible = halo.current.visible = !!wm;
    if (wm) {
      const bx = -Math.sin(wm.facing), bz = -Math.cos(wm.facing), d = wm.radius * 0.85, pulse = 1 + 0.18 * Math.sin(T * 14);
      core.current.position.set(wm.pos.x + bx * d, 6.2, wm.pos.z + bz * d); core.current.scale.setScalar(1.7 * pulse);
      halo.current.position.set(wm.pos.x + bx * d * 1.02, 6.2, wm.pos.z + bz * d * 1.02); halo.current.scale.setScalar(4.2 * pulse); halo.current.rotation.y = Math.atan2(bx, bz);
      mCore.color.setRGB(2.2, 1.3 + 0.5 * Math.sin(T * 10), 0.4); mHalo.opacity = 0.45 + 0.2 * Math.sin(T * 9);
      if (dt > 0 && Math.random() < dt * 14) smokePuff(wm.pos.x + bx * d, 6, wm.pos.z + bz * d, 1, 0xf0e8d8, 2.4, 1.1, 2.6, 0.8, 0.5);
      if (dt > 0 && Math.random() < dt * 20) sparks(wm.pos.x + bx * d, 6, wm.pos.z + bz * d, 2, 0xffc060, 6, 0.24, 0.5, 1.5, bx, 0.4, bz, 1);
      if (dt > 0 && Math.random() < dt * 4) glowPuff(wm.pos.x + bx * d, 6.2, wm.pos.z + bz * d, 0xffa040, 4, 0.4, 1.4, 0.6);
    }
  });

  return (
    <group>
      <mesh ref={aura} geometry={sph} material={mAura} visible={false} frustumCulled={false} renderOrder={29} />
      <mesh ref={core} geometry={sph} material={mCore} visible={false} frustumCulled={false} renderOrder={31} />
      <mesh ref={halo} geometry={ring} material={mHalo} visible={false} frustumCulled={false} renderOrder={31} />
      <group ref={heads}>{Array.from({ length: MAXH }, (_, i) => <mesh key={i} geometry={ring} material={mHead} visible={false} frustumCulled={false} renderOrder={28} />)}</group>
    </group>
  );
}
