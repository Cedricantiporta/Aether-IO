import React from 'react';
import type { LucideIcon } from './GoldIcons';
import { Heart, Wind, Flame, ShieldCheck, Magnet, Star, Target, Snowflake, CloudLightning, Orbit, Tornado, Hammer, Activity, Swords, Megaphone, Sparkles, Sun, Zap, Skull } from './GoldIcons';
import type { Item, Upgrade } from '../../types';
import { ItemArt } from './ItemArt';
import { UpgradeArt } from './UpgradeIcons';
import { PaintedIcon } from './SkillIcons';

/** Painted item icon (see ItemArt). `size` is px or a css length / percentage. */
export const ItemIcon: React.FC<{ item: Item; size?: number | string }> = ({ item, size = 26 }) => <ItemArt item={item} size={size} />;

export const UpgradeIcon: React.FC<{ upgrade: Upgrade; size?: number }> = ({ upgrade, size = 44 }) => <UpgradeArt upgrade={upgrade} size={size} />;

const SKILL_ICON: Record<string, [LucideIcon, string]> = {
  regen: [Heart, '#4ade80'], magnet: [Magnet, '#c58bff'], dash: [Wind, '#6ee7a0'], weapon: [Flame, '#ff9a3c'], barrier: [ShieldCheck, '#ffb347'], special: [Star, '#ffd24a'],
  piercing: [Target, '#9be86a'], burning: [Flame, '#ff6a3c'], freezing: [Snowflake, '#7ee0ff'], thunder: [CloudLightning, '#ffe14a'], gravity: [Orbit, '#b07cff'],
  freezeSpell: [Snowflake, '#7eb8ff'], storm: [ShieldCheck, '#b46bff'], orbital: [Activity, '#6ec1ff'], rage: [Swords, '#ff5a4a'], stamp: [Hammer, '#ff9a3c'],
  orbitalx: [Orbit, '#fff'], warcry: [Megaphone, '#ff6a3c'], inspire: [Sparkles, '#7dffb0'], pierceShot: [Zap, '#7fc8ff'], consecrate: [Sun, '#ffe08a'], smite: [Zap, '#fff3a0'], radiant: [Sparkles, '#ffd76a'], graveCall: [Skull, '#b08aff'], soulHarvest: [Heart, '#9a6bd8'], boneArmor: [ShieldCheck, '#ebe5d0'],
};
const PAINTED_SKILLS = new Set(['GALE_ARROW', 'SHADOW_ROLL', 'FAN_FLAMES', 'LIGHT_ARROW', 'FROST_FIELD', 'STORM_ARROWS', 'SINGULARITY', 'BLINK_NOVA', 'STORM_ORBS', 'CHAIN_FROST', 'METEOR_CATA', 'BLOODRAGE_LEAP', 'WHIRLWIND', 'EARTHSPLITTER', 'BATTLE_CRY', 'TITAN_WRATH', 'RAISE_DEAD', 'SOUL_STEP', 'BONE_SPEAR', 'BONE_WARD', 'CURSE_FIELD', 'ARMY_DEAD', 'piercing', 'burning', 'freezing', 'thunder', 'stamp', 'dash']);
export const SkillIcon: React.FC<{ id: string; size?: number; dim?: boolean }> = ({ id, size = 26, dim }) => {
  if (PAINTED_SKILLS.has(id)) return <span style={{ display: 'block', width: size, height: size, borderRadius: 6, overflow: 'hidden', opacity: dim ? 0.45 : 1 }}><PaintedIcon id={id} /></span>;
  const [I, c] = SKILL_ICON[id] ?? [Star, '#ffd24a'];
  return <I size={size} color={dim ? '#8a7a60' : c} strokeWidth={2.1} />;
};
