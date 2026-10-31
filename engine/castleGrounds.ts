// ============================================================================
// Town Plan v6 (owner 2026-10-31, "the 3-tier kingdom"): the dressing of the MIDDLE TOWN (L2, h 1.8) Royal Way + the CASTLE HILL (L3, h 3.8) gardens that ring the castle.
// Pure data (NO imports: townData, townFill, the renderers and the layout audit all read it). Coordinates are world x / z; the ground height comes from townLift.
// Castle: keep (0, -73.5) 26.6 x 11.8, wings x +-12..33 z -78.5..-68.5, porch in front of the door, ring road x +-40 / z -57 / z -85.6 (3.4 m), L3 front parapet z -52.
// ============================================================================

/** Rounded-rectangle lawns [cx, cz, rx, rz, rot, exponent] (the town GRASS_PATCHES format). Royal Way: four lawns (two a side) between the lane z -29.2 / Terrace Street z -41.4 and the L2 edge. */
export const CG_LAWNS: [number, number, number, number, number, number][] = [
  [-7.4, -21.3, 3.7, 5.0, 0, 5], [7.4, -21.3, 3.7, 5.0, 0, 5], [-7.4, -34.7, 3.7, 3.6, 0, 5], [7.4, -34.7, 3.7, 3.6, 0, 5],
  [38.6, -21.4, 4.4, 4.8, 0, 5],   // the Tavern Row pocket park (east of the tavern)
  // Castle Hill: the two front gardens, the side strips are flower margins (FILL), the back strip is hedge + orchard
  [-21, -63.6, 17.2, 4.1, 0, 5],
];

/** Lamp posts (kit lamp_post, x, z): Royal Way, the castle way, the ring road corners / sides / back. */
export const CG_LAMPS: [number, number][] = [
  ...[-19, -26.4, -35, -45.5].flatMap((z): [number, number][] => [[-3.7, z], [3.7, z]]),   // Royal Way (L2)
  ...[-55.2, -59.5, -63.0].flatMap((z): [number, number][] => [[-4.9, z], [4.9, z]]),          // the castle way (L3)
  [-12, -54.4], [12, -54.4], [-22, -54.4], [22, -54.4], [-35, -54.4], [35, -54.4],         // along the L3 front parapet
  ...[-62, -72, -80].flatMap((z): [number, number][] => [[-42.4, z], [42.4, z]]),             // the side ring road
  [-30, -88], [-15, -88], [0, -88], [15, -88], [30, -88],                                    // the back strip
  [-40.4, -55.1], [40.4, -55.1],
];

/** Benches (x, z, yaw: 0 faces south, PI/2 faces east, -PI/2 faces west, PI faces north). They are sit spots (TOWN_SEATS). */
export const CG_SEATS: [number, number, number][] = [
  [-5.6, -19.6, Math.PI / 2], [5.6, -19.6, -Math.PI / 2], [-5.6, -36.4, Math.PI / 2], [5.6, -36.4, -Math.PI / 2],   // Royal Way lawns, facing the avenue
  [38.6, -18.2, 0],                                                                                                  // the pocket park
  [-27.6, -63.8, Math.PI / 2], [-14.4, -63.8, -Math.PI / 2], [10.4, -64.6, Math.PI / 2], [37.4, -66, -Math.PI / 2],   // the Queen's Garden flanks its fountain; the yard's benches look onto it
  [-8, -81.9, Math.PI], [8, -81.9, Math.PI],                                                                         // behind the keep, looking at it
  [-26, -88.8, 0], [26, -88.8, 0],                                                                                   // the back orchard
];

/** Stone flower boxes [x, z, w, d, kind(1 flowers)]: along the L3 front parapet and round the porch. */
export const CG_PLANTERS: [number, number, number, number, 0 | 1][] = [
  [-7.4, -15.3, 3.0, 1.1, 1], [7.4, -15.3, 3.0, 1.1, 1],
  [-8.2, -53.3, 3.4, 1.1, 1], [8.2, -53.3, 3.4, 1.1, 1], [-17, -53.3, 3.4, 1.1, 1], [17, -53.3, 3.4, 1.1, 1], [-25, -53.3, 3.0, 1.1, 1], [25, -53.3, 3.0, 1.1, 1],
  [-7.4, -66.6, 3.2, 1.1, 1], [7.4, -66.6, 3.2, 1.1, 1],   // beside the porch steps
];

/** Statues (hero statue on a round plinth): x, z, scale (statue_hero is 6.2 m tall at 1.0). */
export const CG_STATUES: [number, number, number][] = [
  [-7.4, -34.7, 0.42], [7.4, -34.7, 0.42],      // the Royal Way lawns
  [-16, -82.2, 0.4], [16, -82.2, 0.4],          // behind the castle
  [-8.4, -61.2, 0.4], [8.4, -61.2, 0.4],        // either side of the castle way
];

/** Fountain / gazebo / well pieces (nature kit): [piece, x, z, scale, collider r]. The west front garden = the Queen's Garden (fountain + gazebo), the east one = the Royal Yard. */
export const CG_PROPS: [string, number, number, number, number][] = [
  ['park_fountain', -21, -63.8, 1.45, 2.9], ['gazebo', -34.2, -64.6, 0.95, 0], ['well', 37.4, -62.6, 1, 1.35],
];
/** Gazebo footprint (its ring collider is built from NK): the west front garden's far end. */
export const CG_GAZEBO = { x: -34.2, z: -64.6, s: 0.95 };

/** Hedge runs [x1, z1, x2, z2] (kit hedge_block, ~2 m pieces, solid): lawn borders on Royal Way, the front-garden borders along the ring road, the side + back margins. Gaps are left where people walk. */
export const CG_HEDGES: [number, number, number, number][] = [
  [-11.7, -26.2, -11.7, -17.0], [11.7, -26.2, 11.7, -17.0], [-11.7, -38.3, -11.7, -31.0], [11.7, -38.3, 11.7, -31.0],
  [-37.2, -59.9, -27.4, -59.9], [-15, -59.9, -8, -59.9], [10, -59.9, 15.4, -59.9], [34.4, -59.9, 38, -59.9],               // along the ring road's front leg (gaps at the fountain axis / the castle way / the yard gate)
  [-42.9, -60, -42.9, -69], [42.9, -60, 42.9, -69], [-42.9, -75, -42.9, -82], [42.9, -75, 42.9, -82],                       // side margins (gap at the wings' height)
  [-38, -90, -4, -90], [4, -90, 38, -90],                                                                                   // the back hedge under the north wall
];

/** Trees (role: 0 oak, 1 blossom, 2 fruit): x, z. */
export const CG_TREES: [number, number, number][] = [
  [-9.8, -31.7, 1], [9.8, -31.7, 1], [-10.2, -23.4, 0], [10.2, -23.4, 0],
  [36.6, -24.8, 1], [41.4, -18, 0],
  [-10.4, -65.6, 1], [10.4, -65.6, 1], [-36.6, -60.8, 1], [36.6, -66.2, 0],
  [-37.2, -73, 0], [37.2, -73, 0], [-37.4, -81, 1], [37.4, -81, 1],
  [-22, -88.9, 2], [-9, -89, 2], [9, -89, 2], [22, -88.9, 2],
];

/** Flower clumps (kit flower_patch -> real Quaternius clumps): x, z, scale. Walk-through, so they may sit anywhere free. */
export const CG_FLOWERS: [number, number, number][] = (() => {
  const f: [number, number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const z of [-17.6, -21.2, -24.8]) f.push([sx * 5.0, z, 0.9]);
    for (const z of [-32.4, -37.0]) f.push([sx * 5.0, z, 0.9]);
  }
  return f;
})();
/** The front-garden beds: rings of clumps round each fountain + along the hedges, the margins of the ring road, the porch and the castle's back. [x, z, scale] */
export const CG_BEDS: [number, number, number][] = (() => {
  const f: [number, number, number][] = [];
  for (const sx of [-1, 1]) {
    if (sx < 0) {   // the Queen's Garden: a ring of beds round the fountain + along the wing's front
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; f.push([-21 + Math.cos(a) * 4.7, -63.8 + Math.sin(a) * 3.0, 0.85]); }
      for (const x of [-37, -31, -26, -16, -11.5]) f.push([x, -67.4, 0.8]);
    } else for (const x of [14, 20, 26, 32, 36]) f.push([x, -58.4 + 0.0, 0]);   // (the yard: no beds)
    for (const z of [-60.6, -66.6, -70.6, -76, -81.5]) f.push([sx * 42.4, z, 0.9]);        // between the ring road and the east / west wall
    f.push([sx * 6.9, -65.2, 0.8]);   // beside the porch steps
  }
  for (const x of [-30, -24, -12, 12, 24, 30]) f.push([x, -82.6, 0.9]);                       // behind the castle
  for (const x of [-34, -29, 29, 34]) f.push([x, -88.6, 0.8]);                                // the back strip
  return f.filter((q) => q[2] > 0);
})();

/** The Royal Yard (training yard, east front garden): dirt floor (rounded rectangle [cx, cz, hx, hz]), weapon / shield racks + armour stands standing on its back edge, hay targets. */
export const CG_YARD = { cx: 24, cz: -63.7, hx: 11.4, hz: 3.4 };
export const CG_YARD_RACKS: [string, number, number, number][] = [   // [piece, x, z, yaw (0 = faces south)]
  ['weapon_rack', 16.5, -66.3, 0], ['shield_rack', 21.5, -66.3, 0], ['weapon_rack', 26.5, -66.3, 0], ['armor_stand', 30.4, -66.0, 0], ['armor_stand', 18.6, -61.0, Math.PI],
];
export const CG_YARD_HAY: [number, number, number, number][] = [[32.6, -62.2, 0.6, 0.7], [34.6, -64.6, 1.4, 0.65]];   // [x, z, yaw, scale]
