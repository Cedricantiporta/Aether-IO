// ============================================================================
// ENGINE CONTRACT — uniform spatial hash for enemies (rebuilt once per frame).
// Integer keys, flat arrays, zero allocations after warm-up.
// ============================================================================

export class SpatialGrid {
  readonly cellSize: number;
  private readonly half: number;      // world half-extent covered
  private readonly cols: number;
  private readonly heads: Int32Array; // per-cell head index into `next`
  private readonly next: Int32Array;  // per-entity linked list
  private readonly results: number[] = [];

  constructor(cellSize: number, worldHalfExtent: number, maxEntities: number) {
    this.cellSize = cellSize;
    this.half = worldHalfExtent;
    this.cols = Math.ceil((worldHalfExtent * 2) / cellSize) + 1;
    this.heads = new Int32Array(this.cols * this.cols).fill(-1);
    this.next = new Int32Array(maxEntities).fill(-1);
  }

  clear(): void { this.heads.fill(-1); }

  private cell(v: number): number {
    const c = Math.floor((v + this.half) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  insert(id: number, x: number, z: number): void {
    const key = this.cell(z) * this.cols + this.cell(x);
    this.next[id] = this.heads[key];
    this.heads[key] = id;
  }

  /**
   * Ids whose cell overlaps the square (x±r, z±r).
   * By default the returned array is shared and overwritten by the next call —
   * pass your own `out` array when nesting queries (e.g. AoE inside a hit loop).
   */
  query(x: number, z: number, r: number, out: number[] = this.results): number[] {
    out.length = 0;
    const x0 = this.cell(x - r), x1 = this.cell(x + r);
    const z0 = this.cell(z - r), z1 = this.cell(z + r);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        let id = this.heads[cz * this.cols + cx];
        while (id !== -1) { out.push(id); id = this.next[id]; }
      }
    }
    return out;
  }
}
