// Ground arrow beside the hero in the town hub. Points at the current quest objective in town (claim at the Quest Board,
// talk to / report to the King, sell loot at the Potion Shop); otherwise at the town gate. Inside the castle it points at
// the King (royal quest) or the exit (quest ready to claim).
import { storyTarget } from '../engine/systems/storyLogic';
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConeGeometry, Color, Mesh, MeshBasicMaterial } from 'three';
import { world, QUEST_POS } from '../engine/world';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { useUiStore } from '../ui/uiStore';
import { GATE, NPCS } from '../engine/townData';
import { CASTLE_DOOR, CASTLE_EXIT } from '../engine/castleData';
import { SHOP_POSITIONS, shopFront } from '../constants';
import { questDone, questNeedsKing } from '../quests';
import { npcs } from '../engine/systems/npcs';
import { npcMarkers } from '../engine/systems/npcQuestLogic';

const GOLD = new Color('#f2c14e'), QUEST = new Color('#4fe3ff');
const KING = NPCS.find((n) => n.king);
const POTION = SHOP_POSITIONS.find((s) => s.type === 'SUPPLIES')!;
const tgt = { x: 0, z: 0, quest: false, hideR: 14 };

function pickTarget(): boolean {
  const st = useGameStore.getState(), qs = st.quests;
  const castle = world.village.area === 'CASTLE';
  const king = qs.some(questNeedsKing), claim = qs.some(questDone);
  const sell = qs.some((q) => q.accepted && q.type === 'SELL_LOOT' && q.progress < q.target) && st.inventory.some((i) => i.type === 'LOOT');
  tgt.quest = true; tgt.hideR = 4.5;
  // the main story comes first when it waits on someone to talk to (gold arrow); field steps fall through to the gate
  const ms = storyTarget();
  if (ms && ms.npc >= 0) {
    tgt.quest = false;
    if ((ms.area === 'CASTLE') === castle) { tgt.x = npcs[ms.npc].x; tgt.z = npcs[ms.npc].z; }
    else if (castle) { tgt.x = CASTLE_EXIT.x; tgt.z = CASTLE_EXIT.z; }
    else { tgt.x = CASTLE_DOOR.x; tgt.z = CASTLE_DOOR.z; }
    return true;
  }
  // a shop / board step (in town; from the castle head for the exit)
  if (ms && ms.shop) {
    tgt.quest = false;
    if (castle) { tgt.x = CASTLE_EXIT.x; tgt.z = CASTLE_EXIT.z; } else { tgt.x = ms.x; tgt.z = ms.z; }
    return true;
  }
  // an NPC story quest ready to turn in (lowest priority of the quest targets)
  const mk = npcMarkers();
  let npcI = -1;
  for (let i = 0; i < mk.length; i++) if (mk[i] === 3 && (npcI < 0 || (NPCS[i].area === 'CASTLE') === castle)) npcI = i;   // prefer one in the current area
  if (castle) {
    if (king && KING?.home) { tgt.x = KING.home[0]; tgt.z = KING.home[1]; return true; }
    if (claim || sell) { tgt.x = CASTLE_EXIT.x; tgt.z = CASTLE_EXIT.z; return true; }
    if (npcI >= 0) { if (NPCS[npcI].area === 'CASTLE') { tgt.x = npcs[npcI].x; tgt.z = npcs[npcI].z; } else { tgt.x = CASTLE_EXIT.x; tgt.z = CASTLE_EXIT.z; } return true; }
    return false;
  }
  if (claim) { tgt.x = QUEST_POS[0]; tgt.z = QUEST_POS[2]; return true; }
  if (king) { tgt.x = CASTLE_DOOR.x; tgt.z = CASTLE_DOOR.z; return true; }
  if (sell) { const f = shopFront(POTION, 4); tgt.x = f.x; tgt.z = f.z; return true; }
  if (npcI >= 0) { if (NPCS[npcI].area === 'CASTLE') { tgt.x = CASTLE_DOOR.x; tgt.z = CASTLE_DOOR.z; } else { tgt.x = npcs[npcI].x; tgt.z = npcs[npcI].z; } return true; }
  tgt.x = GATE.x; tgt.z = GATE.z; tgt.quest = false; tgt.hideR = 14;
  return true;
}

export function GuideArrow() {
  const geo = useMemo(() => new ConeGeometry(0.55, 1.5, 3).rotateX(Math.PI / 2), []);
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, color: GOLD.clone() }), []);
  const ref = useRef<Mesh>(null!);
  const acc = useRef(1);
  useFrame(({ clock }, dt) => {
    const m = ref.current; if (!m) return;
    const on = useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone;
    acc.current += dt;
    let has = true;
    if (acc.current > 0.25) { acc.current = 0; has = pickTarget(); mat.color.copy(tgt.quest ? QUEST : GOLD); (m.userData as { has?: boolean }).has = has; }
    else has = (m.userData as { has?: boolean }).has !== false;
    const p = world.player.pos, dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    m.visible = on && has && d > tgt.hideR;
    if (!m.visible) return;
    const k = 4.2 + Math.sin(clock.elapsedTime * 5) * 0.25;
    m.position.set(p.x + (dx / d) * k, (world.village.area === 'CASTLE' ? 0.35 : 0.25), p.z + (dz / d) * k);
    m.rotation.y = Math.atan2(dx, dz);
  });
  return <mesh ref={ref} geometry={geo} material={mat} visible={false} renderOrder={5} />;
}
