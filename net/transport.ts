// Transports for co-op: one tiny interface, two implementations.
//  - PeerJS (default): free public cloud broker used only for signalling, then a WebRTC DataChannel goes peer-to-peer.
//    `?coopPeer=host:port[:s]` (or localStorage 'aether-coop-peer') points it at another broker (a local `peer` server for tests).
//  - BroadcastChannel (dev / test fallback, `?coopTransport=bc`): two tabs of the SAME browser profile, no network at all.
// Both carry JSON-able values (our compact arrays). Pure TS, no game imports.
import { PEER_PREFIX } from './protocol';

export interface Conn {
  send(d: unknown): void;
  close(): void;
  onData?: (d: unknown) => void;
  onClose?: () => void;
}
export interface Handle { close(): void }
export interface HostCb { onReady(): void; onConn(c: Conn): void; onError(kind: 'taken' | 'net', msg: string): void }
export interface JoinCb { onOpen(c: Conn): void; onError(msg: string): void }
export interface Transport { name: 'peerjs' | 'bc'; host(code: string, cb: HostCb): Handle; join(code: string, cb: JoinCb): Handle }

const qs = (k: string): string | null => { try { return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(k) : null; } catch { return null; } };
const ls = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };

export function pickTransport(): Transport {
  const want = qs('coopTransport') || ls('aether-coop-transport');
  return want === 'bc' && typeof BroadcastChannel !== 'undefined' ? bcTransport : peerTransport;
}

// ------------------------------------------------------------------ PeerJS ---
function peerOpts(): Record<string, unknown> {
  const o: Record<string, unknown> = { debug: 0 };
  const cfg = qs('coopPeer') || ls('aether-coop-peer');   // 'host:port' or 'host:port:s' (secure)
  if (cfg) {
    const [host, port, s] = cfg.split(':');
    o.host = host; o.port = Number(port) || 9000; o.path = '/'; o.secure = s === 's';
  }
  return o;
}
const wrap = (dc: any): Conn => {
  const c: Conn = { send: (d) => { try { if (dc.open) dc.send(d); } catch { /* closed */ } }, close: () => { try { dc.close(); } catch { /* ignore */ } } };
  dc.on('data', (d: unknown) => c.onData?.(d));
  dc.on('close', () => c.onClose?.());
  dc.on('error', () => c.onClose?.());
  return c;
};
export const peerTransport: Transport = {
  name: 'peerjs',
  host(code, cb) {
    let peer: any = null, dead = false;
    import('peerjs').then(({ Peer }) => {
      if (dead) return;
      peer = new Peer(PEER_PREFIX + code, peerOpts());
      peer.on('open', () => cb.onReady());
      peer.on('connection', (dc: any) => { dc.on('open', () => cb.onConn(wrap(dc))); });
      peer.on('error', (e: any) => { if (dead) return; cb.onError(e?.type === 'unavailable-id' ? 'taken' : 'net', String(e?.type || e)); });
    }).catch((e) => cb.onError('net', String(e)));
    return { close() { dead = true; try { peer?.destroy(); } catch { /* ignore */ } } };
  },
  join(code, cb) {
    let peer: any = null, dead = false;
    import('peerjs').then(({ Peer }) => {
      if (dead) return;
      peer = new Peer(peerOpts());
      peer.on('open', () => {
        const dc = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        dc.on('open', () => { if (!dead) cb.onOpen(wrap(dc)); });
        dc.on('error', (e: any) => { if (!dead) cb.onError(String(e?.type || e)); });
      });
      peer.on('error', (e: any) => { if (!dead) cb.onError(e?.type === 'peer-unavailable' ? 'nohost' : String(e?.type || e)); });
    }).catch((e) => cb.onError(String(e)));
    return { close() { dead = true; try { peer?.destroy(); } catch { /* ignore */ } } };
  },
};

// ---------------------------------------------------------- BroadcastChannel ---
const rid = (): string => Math.random().toString(36).slice(2, 10);
interface BcMsg { k: 'probe' | 'taken' | 'join' | 'ok' | 'd' | 'x'; from: string; to?: string; d?: unknown }
function bcConn(ch: BroadcastChannel, me: string, peerId: string): Conn {
  return { send: (d) => ch.postMessage({ k: 'd', from: me, to: peerId, d } as BcMsg), close: () => { ch.postMessage({ k: 'x', from: me, to: peerId } as BcMsg); } };
}
export const bcTransport: Transport = {
  name: 'bc',
  host(code, cb) {
    const me = rid(), ch = new BroadcastChannel('aether-coop-' + code);
    let guest: string | null = null, conn: Conn | null = null, ready = false;
    ch.onmessage = (ev) => {
      const m = ev.data as BcMsg;
      if (m.from === me) return;
      if (m.k === 'probe' && ready) ch.postMessage({ k: 'taken', from: me, to: m.from } as BcMsg);
      else if (m.k === 'taken' && m.to === me) { ready = false; cb.onError('taken', 'taken'); }
      else if (m.k === 'join' && ready) {
        if (guest) { ch.postMessage({ k: 'x', from: me, to: m.from } as BcMsg); return; }
        guest = m.from; conn = bcConn(ch, me, guest);
        ch.postMessage({ k: 'ok', from: me, to: guest } as BcMsg);
        cb.onConn(conn);
      } else if (m.to === me && m.from === guest) {
        if (m.k === 'd') conn?.onData?.(m.d);
        else if (m.k === 'x') { guest = null; const c = conn; conn = null; c?.onClose?.(); }
      }
    };
    ch.postMessage({ k: 'probe', from: me } as BcMsg);
    const t = setTimeout(() => { ready = true; cb.onReady(); }, 200);
    return { close() { clearTimeout(t); if (guest) ch.postMessage({ k: 'x', from: me, to: guest } as BcMsg); ch.close(); } };
  },
  join(code, cb) {
    const me = rid(), ch = new BroadcastChannel('aether-coop-' + code);
    let host: string | null = null, conn: Conn | null = null, dead = false;
    ch.onmessage = (ev) => {
      const m = ev.data as BcMsg;
      if (m.from === me || m.to !== me) return;
      if (m.k === 'ok' && !host) { host = m.from; conn = bcConn(ch, me, host); cb.onOpen(conn); }
      else if (m.from === host) {
        if (m.k === 'd') conn?.onData?.(m.d);
        else if (m.k === 'x') { const c = conn; conn = null; c?.onClose?.(); }
      } else if (m.k === 'x' && !host) cb.onError('full');
    };
    ch.postMessage({ k: 'join', from: me } as BcMsg);
    const t = setTimeout(() => { if (!host && !dead) cb.onError('nohost'); }, 2500);
    return { close() { dead = true; clearTimeout(t); if (host) ch.postMessage({ k: 'x', from: me, to: host } as BcMsg); ch.close(); } };
  },
};
