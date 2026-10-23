import type { GeneratedFile, JsonEntry, Piece, PieceBody, PieceType } from "../types.ts";

export type Body<T extends PieceType> = Extract<PieceBody, { type: T }>;

export function ofType<T extends PieceType>(pieces: readonly Piece[], type: T): Array<Piece & { body: Body<T> }> {
  return pieces.filter((p): p is Piece & { body: Body<T> } => p.body.type === type);
}

export const file = (content: string, executable = false): GeneratedFile => ({ kind: "whole", content, executable });
export const entries = (list: readonly JsonEntry[]): GeneratedFile => ({ kind: "json", entries: list });
export const key = (path: readonly string[], value: unknown): JsonEntry => ({ kind: "key", path, value });
export const item = (path: readonly string[], value: unknown): JsonEntry => ({ kind: "item", path, value });

/** Skills share one layout everywhere: <dir>/<id>/SKILL.md plus supporting files. */
export function skillFiles(pieces: readonly Piece[], dir: string): Array<[string, GeneratedFile]> {
  return ofType(pieces, "skills").flatMap((p) => [...p.body.files].map(([rel, c]): [string, GeneratedFile] => [`${dir}/${p.id}/${rel}`, file(c)]));
}

export const plainMarkdown = (pieces: readonly Piece[], type: "commands", dir: string): Array<[string, GeneratedFile]> =>
  ofType(pieces, type).map((p) => [`${dir}/${p.id}.md`, file(p.body.body)]);

export const unsupportedTypes = (pieces: readonly Piece[], supports: ReadonlySet<PieceType>, target: string): string[] =>
  pieces.filter((p) => !supports.has(p.body.type)).map((p) => `${target}: ${p.key} (${p.body.type} not supported)`);

export const rulesSection = (pieces: readonly Piece[]): string =>
  ofType(pieces, "rules").map((p) => `### ${p.id}\n\n${p.body.globs.length ? `Applies to ${p.body.globs.map((g) => `\`${g}\``).join(", ")}.\n\n` : ""}${p.body.body.trim()}\n`).join("\n");
