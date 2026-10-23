// Pure: manifest + registry index -> the ordered set of piece keys to install.
import { ParseError, pieceKey } from "./parse.ts";
import { PIECE_TYPES } from "./types.ts";
import type { Manifest, PieceKey, PieceLists, Preset, PresetId } from "./types.ts";

const keysOf = (lists: PieceLists): PieceKey[] => PIECE_TYPES.flatMap((t) => (lists[t] ?? []).map((id) => pieceKey(t, id)));

/** Depth-first, parents before children, each preset once. Throws on cycles and unknown presets. */
export function expandPreset(presets: ReadonlyMap<PresetId, Preset>, id: PresetId, stack: readonly PresetId[] = []): PieceKey[] {
  if (stack.includes(id)) throw new ParseError(`preset cycle: ${[...stack, id].join(" -> ")}`);
  const preset = presets.get(id);
  if (!preset) throw new ParseError(`unknown preset "${id}"${hint(id, [...presets.keys()])}`, "unknown-preset", "agentproof-kit list");
  return [...preset.extends.flatMap((p) => expandPreset(presets, p, [...stack, id])), ...keysOf(preset.pieces)];
}

export function resolvePieces(manifest: Manifest, presets: ReadonlyMap<PresetId, Preset>, known: ReadonlySet<PieceKey>): PieceKey[] {
  const removed = new Set(keysOf(manifest.remove));
  const wanted = [...new Set([...manifest.presets.flatMap((p) => expandPreset(presets, p)), ...keysOf(manifest.add)])].filter((k) => !removed.has(k));
  const missing = wanted.filter((k) => !known.has(k));
  if (missing.length) throw new ParseError(`not in registry: ${missing.map((k) => `${k}${hint(k, [...known])}`).join(", ")}`, "unknown-piece", "agentproof-kit list");
  return wanted.sort();
}

/** " (did you mean x?)" for the closest name within 3 edits, or "". */
export function hint(word: string, names: readonly string[]): string {
  let best = "", bestD = 4;
  for (const n of names) {
    const d = distance(word, n);
    if (d < bestD) [best, bestD] = [n, d];
  }
  return best ? ` (did you mean ${best}?)` : "";
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}
