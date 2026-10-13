import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FlaskConical, Hexagon, Heart, Wand2, Crosshair, Axe, Sword, Shield, Gem, Ghost, Package, Droplet, Bug, Bird, Dog, Mountain, Sparkles, Flame, Egg, Star,
  ArrowUpCircle, Zap, Wind, ShieldCheck, Magnet, Tornado, Hammer, Activity, Snowflake, CloudLightning, Orbit, Swords, Target, Footprints, Skull,
  Shirt, CircleDot,
} from 'lucide-react';
import type { Item, Upgrade } from '../../types';
import { RARITY_TEXT } from '../lib/game';

const PET_ICON: Record<string, LucideIcon> = {
  pet_blob: Droplet, pet_bat: Bug, pet_fairy: Sparkles, pet_wolf: Dog, pet_dragon: Flame, pet_rock: Mountain, pet_golem: Shield, pet_phoenix: Bird, pet_demigod: Star,
};

export const ItemIcon: React.FC<{ item: Item; size?: number }> = ({ item, size = 26 }) => {
  const c = RARITY_TEXT[item.rarity];
  switch (item.type) {
    case 'POTION': return <FlaskConical size={size} color={item.id.includes('mana') ? '#5b9bff' : '#ff5a5a'} fill={item.id.includes('mana') ? 'rgba(60,120,255,.35)' : 'rgba(255,60,60,.35)'} strokeWidth={2} />;
    case 'CORE': return <Hexagon size={size} color="#7cc4ff" fill="rgba(90,170,255,.35)" />;
    case 'REVIVE': return <Heart size={size} color="#ffd24a" fill="rgba(255,210,74,.5)" />;
    case 'WEAPON':
      if (item.projectileType === 'MAGIC') return <Wand2 size={size} color={c} />;
      if (item.projectileType === 'ARROW') return <Crosshair size={size} color={c} />;
      if (item.projectileType === 'AXE') return <Axe size={size} color={c} />;
      return <Sword size={size} color={c} />;
    case 'ARMOR': return item.id.includes('vest') || item.id.includes('elven') ? <Shirt size={size} color={c} /> : <Shield size={size} color={c} />;
    case 'ACCESSORY': return item.id.includes('ring') ? <CircleDot size={size} color={c} /> : item.id.includes('boots') ? <Footprints size={size} color={c} /> : <Gem size={size} color={c} />;
    case 'PET': { const I = PET_ICON[item.id] ?? Ghost; return <I size={size} color={c} />; }
    default: return <Package size={size} color={c} />;
  }
};

const UPGRADE_ICON: Record<string, LucideIcon> = {
  SKILL_ORBITAL: Orbit, SKILL_THUNDER: CloudLightning, SKILL_REGEN: Heart, SKILL_MAGNET: Magnet, SKILL_DASH: Wind, SKILL_WEAPON: Flame,
  SKILL_BARRIER: ShieldCheck, SKILL_PIERCING: Target, SKILL_BURNING: Flame, SKILL_FREEZING: Snowflake, SKILL_FREEZE_SPELL: Snowflake,
  SKILL_GRAVITY: Orbit, SKILL_STAMP: Hammer, SKILL_RAGE: Swords, SKILL_STORM: Tornado,
  HEALTH: Heart, SPEED: Footprints, DAMAGE: Sword, FIRE_RATE: Zap, MULTISHOT: Sparkles, DASH_COOLDOWN: Wind, CRIT_RATE: Target, CRIT_DAMAGE: Skull,
  DEFENSE: Shield, MAX_MANA: Droplet,
};
export const UpgradeIcon: React.FC<{ upgrade: Upgrade; size?: number }> = ({ upgrade, size = 44 }) => {
  const I = UPGRADE_ICON[upgrade.type] ?? ArrowUpCircle;
  return <I size={size} color="#fff6d8" strokeWidth={1.8} style={{ position: 'relative', zIndex: 1, filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.8))' }} />;
};

const SKILL_ICON: Record<string, [LucideIcon, string]> = {
  regen: [Heart, '#4ade80'], magnet: [Magnet, '#c58bff'], dash: [Wind, '#6ee7a0'], weapon: [Flame, '#ff9a3c'], barrier: [ShieldCheck, '#ffb347'], special: [Star, '#ffd24a'],
  piercing: [Target, '#9be86a'], burning: [Flame, '#ff6a3c'], freezing: [Snowflake, '#7ee0ff'], thunder: [CloudLightning, '#ffe14a'], gravity: [Orbit, '#b07cff'],
  freezeSpell: [Snowflake, '#7eb8ff'], storm: [Tornado, '#8fa0ff'], orbital: [Activity, '#6ec1ff'], rage: [Swords, '#ff5a4a'], stamp: [Hammer, '#ff9a3c'],
  orbitalx: [Orbit, '#fff'],
};
export const SkillIcon: React.FC<{ id: string; size?: number; dim?: boolean }> = ({ id, size = 26, dim }) => {
  const [I, c] = SKILL_ICON[id] ?? [Star, '#ffd24a'];
  return <I size={size} color={dim ? '#8a7a60' : c} strokeWidth={2.1} />;
};
