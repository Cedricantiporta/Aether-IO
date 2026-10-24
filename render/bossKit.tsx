// Creature-kit boss rigs (docs/CREATURE_PLAN.md): the big bosses are non-instanced (render/Bosses.tsx, Bosses2.tsx, WarMachine.tsx,
// GiantBosses.tsx). Each keeps its own state machine / animation targets; this file only builds a joint tree from a kit piece
// (shared geometry, per-boss materials) so the component can pose the joints by name. The rig sits in a wrapper group whose scale
// turns the old model scale into the kit scale (kit pieces are authored at ENEMY_DEFS.scale).
import { useMemo } from 'react';
import { Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three';
import { useCreatureKit, type CreatureKit } from './creatureKit';

export interface BossMats { lit: MeshStandardMaterial; glow: MeshBasicMaterial }
export function makeBossMats(transparent = false): BossMats {
  return {
    lit: new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, flatShading: false, transparent, side: DoubleSide }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6), transparent }),
  };
}

export interface BossRig { root: Group; J: Record<string, Object3D> }
/** Joint tree of one kit piece. Joint objects use YXZ order and are keyed by their kit name (`armL`, `head`, `shin0`, ...). */
export function makeBossRig(kit: CreatureKit, piece: string, m: BossMats, cast = true): BossRig | null {
  const kp = kit.P[piece]; if (!kp) return null;
  const root = new Group(), objs: Object3D[] = [], J: Record<string, Object3D> = {};
  for (const j of kp.joints) {
    const o = new Object3D(); o.position.set(j.px, j.py, j.pz); o.rotation.order = 'YXZ';
    if (j.parent < 0) root.add(o); else objs[j.parent].add(o);
    objs.push(o); J[j.key] = o;
    if (j.lit) { const mesh = new Mesh(j.lit, m.lit as Material); mesh.castShadow = cast; mesh.receiveShadow = false; o.add(mesh); }
    if (j.glow) o.add(new Mesh(j.glow, m.glow as Material));
  }
  return { root, J };
}

/** React helper: the rig for `piece` once the kit is loaded (null before: the caller keeps its old meshes visible). */
export function useBossRig(piece: string, m: BossMats, cast = true, on = true): BossRig | null {
  const kit = useCreatureKit();
  return useMemo(() => (kit && on ? makeBossRig(kit, piece, m, cast) : null), [kit, piece, m, cast, on]);
}
