# Recipe: sync new state in co-op
- Host is authoritative; the guest simulates its own hero and sends hit claims. Messages are in `net/protocol.ts`, host side `net/coopHost.ts`, guest side `net/coopGuest.ts`.
- Add fields at the END of an existing message (older peers ignore them) and sanitise on receive (`isNum`).
- Prefer a bit/flag in an existing word over a new message. Per-frame visuals on the guest are cosmetic only (see `net/coopMinions.ts` ghosts).
- Test with the BroadcastChannel transport (`?coopTransport=bc`) in two headless pages.
