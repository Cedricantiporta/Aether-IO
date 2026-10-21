// ============================================================================
// Kit v3 footprints for the engine (pure data, no three / no React). The kit itself (public/models/town/kit_v3.glb) is loaded by render/kitV3.tsx; colliders
// and layout checks cannot wait for the GLB, so the pieces the TOWN uses keep their local bounding boxes here (measured from the GLB, scale 1, rotation 0):
// [x0, x1, z0, z1, height]. Front = +Z, origin = ground centre. `render/kitV3.tsx kitV3Box(piece)` returns the same numbers once the kit is in.
// `v3Ring` / `v3Disc` turn a footprint into movement colliders [x, z, r] (rotated by the piece's yaw like render/kitV3 merge: x' = x cos + z sin, z' = -x sin + z cos).
// ============================================================================
export type V3Box = [x0: number, x1: number, z0: number, z1: number, h: number];
export const V3_BOX: Record<string, V3Box> = {
  adventure_portal: [-4.6, 4.6, -1.4, 3.4, 7.34], anvil_big: [-0.52, 0.94, -1.25, 1.22, 1.4], armor_stand: [-1.1, 0.86, -0.6, 0.6, 3.1],
  awning_green: [-1.55, 1.55, -0.04, 1.24, 1.26], awning_red: [-1.55, 1.55, -0.04, 1.24, 1.26], banner_pole: [-1, 1, -0.35, 0.35, 5.45], banner_pole_red: [-1, 1, -0.35, 0.35, 5.45],
  beach_crates: [-1.15, 1.76, -0.6, 1.64, 1.81], beach_umbrella: [-1.69, 1.93, -1.81, 1.81, 3.27], bird_cage: [-0.3, 1.01, -0.32, 0.32, 2.57],
  bridge_stone_arch: [-5.45, 5.45, -1.9, 1.9, 2.54], bridge_wood_small: [-3.25, 3.25, -1.1, 1.1, 2.06], bush_cluster: [-1.64, 1.61, -1.56, 1.53, 1.96],
  campfire: [-1.82, 2.11, -1.03, 1.71, 1.23], cart_hay: [-1.2, 2.9, -0.9, 0.9, 2.4], cauldron: [-1.14, 1.14, -1.06, 1.06, 1.43],
  cliff_rock_large: [-4.03, 4.26, -3.17, 3.18, 5.03], crate_stack_big: [-1.88, 2.32, -0.83, 1.32, 2.61], doghouse: [-0.85, 0.85, -1, 1.68, 1.75],
  fishing_net_rack: [-2.01, 2.66, -0.66, 1.16, 2.63], flower_bed_long: [-2.41, 2.41, -0.87, 0.87, 0.89], flower_bed_round: [-1.72, 1.72, -1.72, 1.72, 1.3],
  flower_cart: [-1.05, 2.36, -0.69, 0.69, 1.78], forge_furnace: [-1.3, 1.58, -0.9, 0.94, 3.58], fortune_tent: [-2.35, 2.35, -2.35, 2.35, 4.67],
  fruit_crate: [-0.62, 0.62, -0.45, 0.45, 0.92], grindstone: [-0.6, 0.94, -0.62, 0.75, 1.47], hanging_lantern: [-0.34, 0.34, -0.39, 0.39, 2.62],
  hedge_arch: [-2.72, 2.75, -0.84, 0.86, 4.92], herb_garden_box: [-1.2, 1.3, -0.55, 0.64, 1.27], lamp_post_double: [-1.34, 1.34, -0.42, 0.42, 3.86],
  laundry_line: [-2.25, 2.25, -0.25, 0.46, 3.08], lily_pads: [-1.27, 1.68, -1.39, 0.98, 0.3], market_tent_green: [-2.05, 2.05, -1.99, 2.05, 4.05], market_tent_red: [-2.05, 2.05, -1.99, 2.05, 4.05],
  notice_board: [-1.35, 1.35, -0.36, 0.53, 3.06], palm_v3: [-1.56, 3.6, -2.69, 2.47, 5.66], pet_pen_fence: [-2.11, 2.11, -0.13, 0.13, 1.2], potion_shelf_cart: [-1.15, 2.31, -0.8, 0.65, 2.52],
  potted_plant_a: [-0.49, 0.53, -0.48, 0.51, 1.64], potted_plant_b: [-0.59, 0.63, -0.61, 0.62, 1.61], reed_cluster: [-1.01, 0.95, -0.99, 0.97, 2.29],
  rock_cluster_small: [-0.92, 1.19, -0.69, 0.99, 0.96], shield_rack: [-1.7, 1.7, -0.35, 0.35, 1.91], ship_big: [-3.35, 3.35, -7.03, 7.74, 11.55],
  shop_sign_hanging: [-0.1, 1.73, -0.03, 0.23, 1.13], stairs_stone: [-2.09, 2.09, -1.9, 2.23, 3.25], statue_hero: [-1.45, 1.45, -1.25, 1.25, 6.21],
  tech_tower_small: [-2.2, 2.2, -2.31, 3.05, 7.45], tree_birch: [-1.92, 1.91, -1.69, 1.63, 6.81], tree_blossom: [-2.96, 2.79, -1.8, 2.62, 5.89],
  tree_fruit: [-2.57, 2.61, -1.75, 2.31, 5.29], tree_oak_big: [-3.68, 3.7, -2.1, 3.18, 7.32], tree_oak_small: [-2.37, 2.43, -1.89, 2.13, 4.86],
  tree_pine_layered_a: [-2.53, 2.53, -2.28, 2.28, 6.73], tree_pine_layered_b: [-1.87, 1.87, -1.68, 1.68, 4.93], tree_willow: [-2.75, 2.57, -2.45, 2.5, 6.38],
  wall_tower_round: [-3.01, 3.01, -3.01, 3.8, 13.18], weapon_rack: [-1.45, 1.45, -0.35, 0.35, 2.41], window_flowerbox: [-0.76, 0.75, -0.01, 0.38, 0.72],
};
export const isV3 = (piece: string): boolean => piece in V3_BOX;

/** Per-piece draw scale (multiplied into every placement) so a v3 piece takes the room the nature-kit piece it replaces used to take: the layout tables keep their
 *  old numbers (townFill scale ranges, TOWN_TREES.s, forest ring ...) and the kit's own size differences live HERE. */
export const V3_K: Record<string, number> = {
  tree_oak_big: 0.7, tree_oak_small: 0.92, tree_birch: 0.82, tree_fruit: 0.82, tree_blossom: 0.8, tree_willow: 0.85,
  tree_pine_layered_a: 0.82, tree_pine_layered_b: 0.95, palm_v3: 0.95, bush_cluster: 0.78,
};

const C = (c: [number, number, number][], x: number, z: number, r: number) => { c.push([x, z, r]); };
/** Circles along the outline of a piece's footprint (scale s, yaw ry at x, z), inset like kitRing so the reach is the edge + 0.3. `fill` also adds the inside (big props). */
export function v3Ring(c: [number, number, number][], piece: string, x: number, z: number, ry = 0, s = 1, r = 0.6, fill = false): void {
  const b = V3_BOX[piece]; if (!b) return;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const x0 = b[0] * s + r - 0.3, x1 = b[1] * s - r + 0.3, z0 = b[2] * s + r - 0.3, z1 = b[3] * s - r + 0.3;
  const at = (lx: number, lz: number) => C(c, x + lx * cs + lz * sn, z - lx * sn + lz * cs, r);
  if (x1 - x0 < 0.2 || z1 - z0 < 0.2) { at((x0 + x1) / 2, (z0 + z1) / 2); if (x1 - x0 >= 0.2) { at(x0, (z0 + z1) / 2); at(x1, (z0 + z1) / 2); } else if (z1 - z0 >= 0.2) { at((x0 + x1) / 2, z0); at((x0 + x1) / 2, z1); } return; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / (r * 1.5))), nz = Math.max(1, Math.ceil((z1 - z0) / (r * 1.5)));
  for (let i = 0; i <= nx; i++) { const px = x0 + ((x1 - x0) * i) / nx; at(px, z0); at(px, z1); }
  for (let j = 1; j < nz; j++) { const pz = z0 + ((z1 - z0) * j) / nz; at(x0, pz); at(x1, pz); }
  if (fill) for (let i = 1; i < nx; i++) for (let j = 1; j < nz; j++) at(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz);
}
/** One circle at the footprint's centre (small props: potted plants, grindstones, hanging lanterns ...). */
export function v3Disc(c: [number, number, number][], piece: string, x: number, z: number, ry = 0, s = 1, r = 0.4): void {
  const b = V3_BOX[piece]; if (!b) return;
  const lx = ((b[0] + b[1]) / 2) * s, lz = ((b[2] + b[3]) / 2) * s;
  C(c, x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry), r);
}
