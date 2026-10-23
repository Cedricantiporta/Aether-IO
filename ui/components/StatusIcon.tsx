import React from 'react';

/** Painted status icons (public/art/status/<id>.webp, transparent 256 px - docs/ART_PROMPTS.md). */
export const STATUS_ICONS = new Set([
  'stun', 'root', 'silence', 'defdown', 'blind', 'burn', 'poison', 'bleed', 'slow', 'freeze', 'fear', 'armorbreak',
  'battlecry', 'rage', 'haste', 'shield',
]);

/** Status / buff type (engine or UI id, any case) -> painted icon id. Unlisted types return undefined (callers keep their glyph). */
const ALIAS: Record<string, string> = {
  chill: 'freeze', frozen: 'freeze', terrify: 'fear', terrified: 'fear',
  armor_break: 'armorbreak', armor: 'armorbreak', defense_down: 'defdown', curse: 'defdown',
  cry: 'battlecry', warcry: 'battlecry', bloodrage: 'rage', speed: 'haste',
  barrier: 'shield', aegis: 'shield',
};
export function statusIconId(type: string): string | undefined {
  const k = type.toLowerCase();
  const id = ALIAS[k] ?? k;
  return STATUS_ICONS.has(id) ? id : undefined;
}

const URL_BASE = (((import.meta as any).env?.BASE_URL as string) || '/') + 'art/status/';
/** Same look as ItemArt's PaintImg: contain-fit, soft drop shadow. */
export const StatusImg: React.FC<{ id: string; size: number | string }> = React.memo(({ id, size }) => (
  <img src={`${URL_BASE}${id}.webp`} alt="" draggable={false} decoding="async"
    style={{ display: 'block', width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.55))', pointerEvents: 'none' }} />
));
StatusImg.displayName = 'StatusImg';

/** Painted icon for a status type, or the supplied glyph when none exists. */
export const StatusIcon: React.FC<{ type: string; size: number | string; fallback: React.ReactNode }> = ({ type, size, fallback }) => {
  const id = statusIconId(type);
  return id ? <StatusImg id={id} size={size} /> : <>{fallback}</>;
};
