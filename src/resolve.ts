// Pure: manifest + registry index -> the ordered set of piece keys to install.
import { ParseError, pieceKey } from "./parse.ts";
import { PIECE_TYPES } from "./types.ts";
import type { Manifest, PieceKey, PieceLists, Preset, PresetId } from "./types.ts";

const keysOf = (lists: PieceLists): PieceKey[] => PIECE_TYPES.flatMap((t) => (lists[t] ?? []).map((id) => pieceKey(t, id)));

/** Depth-first, parents before children, each preset once. Throws on cycles and unknown presets. */
export function expandPreset(presets: ReadonlyMap<PresetId, Preset>, id: PresetId, stack: readonly PresetId[] = []): PieceKey[] {
  if (stack.includes(id)) throw new ParseError(`preset cycle: ${[...stack, id].join(" -> ")}`);
  const preset = presets.get(id);
  if (!preset) throw new ParseError(`unknown preset "${id}"`);
  return [...preset.extends.flatMap((p) => expandPreset(presets, p, [...stack, id])), ...keysOf(preset.pieces)];
}

export function resolvePieces(manifest: Manifest, presets: ReadonlyMap<PresetId, Preset>, known: ReadonlySet<PieceKey>): PieceKey[] {
  const removed = new Set(keysOf(manifest.remove));
  const wanted = [...new Set([...manifest.presets.flatMap((p) => expandPreset(presets, p)), ...keysOf(manifest.add)])].filter((k) => !removed.has(k));
  const missing = wanted.filter((k) => !known.has(k));
  if (missing.length) throw new ParseError(`not in registry: ${missing.join(", ")}`);
  return wanted.sort();
}
