// Co-op wire helpers: Uint16 <-> base64 (the DataChannel carries JSON, so binary records ride as one base64 string) and the compact
// event codec. Pure TS; allocation only per message (a string), never per entity.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ENC = new Uint8Array(64); for (let i = 0; i < 64; i++) ENC[i] = ABC.charCodeAt(i);
const DEC = new Uint8Array(128).fill(255); for (let i = 0; i < 64; i++) DEC[ABC.charCodeAt(i)] = i;
const chars = new Uint8Array(16384 * 4);   // output scratch (up to 49152 u16 per message)

/** `n` u16 values -> base64 text (little-endian bytes, no padding). */
export function u16ToB64(a: Uint16Array, n: number): string {
  let o = 0, i = 0;
  const bytes = n * 2;
  const get = (k: number): number => { const v = a[k >> 1]; return (k & 1) === 0 ? v & 255 : v >> 8; };
  for (; i + 2 < bytes; i += 3) {
    const x = get(i), y = get(i + 1), z = get(i + 2);
    chars[o++] = ENC[x >> 2]; chars[o++] = ENC[((x & 3) << 4) | (y >> 4)]; chars[o++] = ENC[((y & 15) << 2) | (z >> 6)]; chars[o++] = ENC[z & 63];
  }
  if (i < bytes) {   // 1 or 2 bytes left
    const x = get(i), y = i + 1 < bytes ? get(i + 1) : 0;
    chars[o++] = ENC[x >> 2]; chars[o++] = ENC[((x & 3) << 4) | (y >> 4)]; if (i + 1 < bytes) chars[o++] = ENC[(y & 15) << 2];
  }
  let s = '';
  for (let k = 0; k < o; k += 8192) s += String.fromCharCode.apply(null, chars.subarray(k, Math.min(o, k + 8192)) as unknown as number[]);
  return s;
}

/** base64 text -> u16 values into `out`; returns the count (0 when the text is not valid / too big). */
export function b64ToU16(s: string, out: Uint16Array): number {
  const len = s.length;
  if (len > chars.length || len % 4 === 1) return 0;
  let n = 0, acc = 0, bits = 0, half = 0, lo = 0;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i), v = c < 128 ? DEC[c] : 255;
    if (v === 255) return 0;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const byte = (acc >> bits) & 255; acc &= (1 << bits) - 1;
      if (half === 0) { lo = byte; half = 1; } else { if (n >= out.length) return 0; out[n++] = lo | (byte << 8); half = 0; }
    }
  }
  return n;
}

// ---------------------------------------------------------------- events ---
// Spec letters: v = Vector3 (3 ints, 0.1 precision), V = optional Vector3 (0 | 1,x,y,z), n = number (2 decimals), i = integer, s = string, b = boolean.
export interface EvDef { name: string; spec: string; keys: string[] }
const def = (name: string, fields: string): EvDef => {
  const keys: string[] = [], spec: string[] = [];
  if (fields) for (const f of fields.split(',')) { const [k, t] = f.split(':'); keys.push(k); spec.push(t); }
  return { name, spec: spec.join(''), keys };
};
/** Events the HOST sends to the guest (world FX + the host hero's own moments). Index = position in this array. */
export const EV_H2G: EvDef[] = [
  def('damage', 'pos:v,amount:n,crit:b,kind:s,dot:b'),
  def('enemyHit', 'pos:v,kind:s,dmgKind:s,dir:V'),
  def('enemyDeath', 'pos:v,kind:s,elite:b,boss:b,scale:n,poof:b,mini:b,env:s'),
  def('floatText', 'pos:v,text:s,color:i,scale:n,dy:n'),
  def('trick', 'pos:v,kind:s,radius:n'),
  def('slam', 'pos:v,damage:n'),
  def('armorBreak', 'pos:v'),
  def('stagger', 'pos:v,boss:b'),
  def('explosion', 'pos:v,radius:n,color:i'),
  def('shockwave', 'pos:v,radius:n,color:i'),
  def('crater', 'pos:v,radius:n,color:i'),
  def('lightning', 'from:v,to:v'),
  def('frostNova', 'pos:v,radius:n'),
  def('projectileImpact', 'pos:v,kind:s,tint:i'),
  def('fxImpact', 'pos:v,kind:s,radius:n'),
  def('shout', 'pos:v,radius:n'),
  def('quake', 'pos:v,radius:n'),
  def('fissure', 'from:v,dir:v,length:n'),
  def('blink', 'from:v,to:v'),
  def('leap', 'from:v,to:v,dur:n'),
  def('orbZap', 'from:v,to:v'),
  def('shake', 'amount:n'),
  def('telegraph', 'pos:v,radius:n,duration:n'),
  def('spawn', 'pos:v,kind:s,elite:b'),
  def('bossSpawn', 'name:s,title:s'),
  def('bossPhase', 'phase:i'),
  def('shoot', 'pos:v,dir:v,kind:s'),
  def('dash', 'from:v,dir:v'),
  def('ultImpact', 'pos:v,name:s,radius:n'),
  def('crateBreak', 'pos:v,kind:s'),
];
/** Events the GUEST sends to the host: only the cosmetic half of his own hero's moments (no gameplay listeners hang on these). */
export const EV_G2H: EvDef[] = [
  def('explosion', 'pos:v,radius:n,color:i'),
  def('shockwave', 'pos:v,radius:n,color:i'),
  def('crater', 'pos:v,radius:n,color:i'),
  def('lightning', 'from:v,to:v'),
  def('frostNova', 'pos:v,radius:n'),
  def('projectileImpact', 'pos:v,kind:s,tint:i'),
  def('fxImpact', 'pos:v,kind:s,radius:n'),
  def('shout', 'pos:v,radius:n'),
  def('quake', 'pos:v,radius:n'),
  def('fissure', 'from:v,dir:v,length:n'),
  def('blink', 'from:v,to:v'),
  def('leap', 'from:v,to:v,dur:n'),
  def('orbZap', 'from:v,to:v'),
  def('shoot', 'pos:v,dir:v,kind:s'),
  def('dash', 'from:v,dir:v'),
  def('ultImpact', 'pos:v,name:s,radius:n'),
];

const r1 = (v: number): number => Math.round(v * 10);
const r2 = (v: number): number => Math.round(v * 100) / 100;
/** Encodes one event (payload object) into [idx, ...fields]; null when a required vector is missing. */
export function encodeEvent(table: EvDef[], idx: number, payload: Record<string, unknown>): unknown[] | null {
  const d = table[idx], out: unknown[] = [idx];
  for (let k = 0; k < d.keys.length; k++) {
    const v = payload[d.keys[k]];
    switch (d.spec[k]) {
      case 'v': { const p = v as { x: number; y: number; z: number } | undefined; if (!p) return null; out.push(r1(p.x), r1(p.y), r1(p.z)); break; }
      case 'V': { const p = v as { x: number; y: number; z: number } | undefined; if (!p) out.push(0); else out.push(1, r1(p.x), r1(p.y), r1(p.z)); break; }
      case 'n': out.push(typeof v === 'number' && isFinite(v) ? r2(v) : 0); break;
      case 'i': out.push(typeof v === 'number' && isFinite(v) ? Math.round(v) : 0); break;
      case 's': out.push(typeof v === 'string' ? v.slice(0, 40) : ''); break;
      case 'b': out.push(v ? 1 : 0); break;
      default: break;
    }
  }
  return out;
}
const isN = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
/** Decodes [idx, ...fields]; `mkVec` builds the Vector3 (kept out of here so this file stays dependency-free). Returns null when malformed. */
export function decodeEvent<V>(table: EvDef[], arr: unknown[], mkVec: (x: number, y: number, z: number) => V): { name: string; payload: Record<string, unknown> } | null {
  const idx = arr[0];
  if (!isN(idx) || idx < 0 || idx >= table.length) return null;
  const d = table[idx], payload: Record<string, unknown> = {};
  let i = 1;
  for (let k = 0; k < d.keys.length; k++) {
    const key = d.keys[k];
    switch (d.spec[k]) {
      case 'v': { const x = arr[i], y = arr[i + 1], z = arr[i + 2]; if (!isN(x) || !isN(y) || !isN(z)) return null; payload[key] = mkVec(x / 10, y / 10, z / 10); i += 3; break; }
      case 'V': { if (arr[i] === 1) { const x = arr[i + 1], y = arr[i + 2], z = arr[i + 3]; if (!isN(x) || !isN(y) || !isN(z)) return null; payload[key] = mkVec(x / 10, y / 10, z / 10); i += 4; } else i += 1; break; }
      case 'n': case 'i': { const v = arr[i++]; if (!isN(v)) return null; payload[key] = v; break; }
      case 's': { const v = arr[i++]; if (typeof v !== 'string') return null; payload[key] = v.slice(0, 40); break; }
      case 'b': payload[key] = arr[i++] === 1; break;
      default: break;
    }
  }
  return { name: d.name, payload };
}
