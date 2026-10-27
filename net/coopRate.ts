// Co-op STEP 4: one shared number the senders multiply their intervals by: 1 normally, 2 when this device renders slowly (a phone at < ~25 fps), so the network
// layer never asks a struggling frame for more work (fewer SNAP / PZ / GP / HAZ messages to build and parse). Written once per frame by coopTick.
export const rate = { mul: 1, ema: 16 };
/** `frameMs` = time since the previous frame; smoothed; hysteresis between 40 ms (25 fps) and 30 ms. */
export function rateFrame(frameMs: number): void {
  if (!(frameMs > 0) || frameMs > 1000) return;   // (a stall / background tab: not a measure of speed)
  rate.ema += (frameMs - rate.ema) * 0.05;
  if (rate.mul === 1 && rate.ema > 40) rate.mul = 2;
  else if (rate.mul === 2 && rate.ema < 30) rate.mul = 1;
}
