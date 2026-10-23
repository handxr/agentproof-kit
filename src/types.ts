// The data shape. Everything else is a function over these types.

export const PIECE_TYPES = ["skills", "mcp", "rules", "commands", "agents", "hooks", "permissions"] as const;
export type PieceType = (typeof PIECE_TYPES)[number];

export const TARGETS = ["cursor", "claude", "codex"] as const;
export type Target = (typeof TARGETS)[number];

/** "skills/code-review". Only `parsePieceKey` creates one. */
export type PieceKey = string & { readonly __brand: "PieceKey" };
export type PresetId = string & { readonly __brand: "PresetId" };

/** Per-type id lists. Used by presets and by the manifest's add/remove. */
export type PieceLists = Partial<Record<PieceType, readonly string[]>>;

export type Preset = { readonly extends: readonly PresetId[]; readonly pieces: PieceLists };

/** agents.json */
export type Manifest = {
  readonly registry: string;
  readonly presets: readonly PresetId[];
  readonly add: PieceLists;
  readonly remove: PieceLists;
  readonly targets: readonly Target[];
};

export type McpServer =
  | { readonly kind: "stdio"; readonly command: string; readonly args: readonly string[]; readonly env: readonly string[] }
  | { readonly kind: "http"; readonly url: string; readonly bearerTokenEnv: string | null };

export type HookEvent = "preShell" | "postEdit";

export type Frontmatter = Readonly<Record<string, string | boolean | readonly string[]>>;

/** One piece's parsed content. A discriminated union: the adapter never re-parses. */
export type PieceBody =
  | { readonly type: "skills"; readonly files: ReadonlyMap<string, string> } // relative path -> content, includes SKILL.md
  | { readonly type: "mcp"; readonly server: McpServer }
  | { readonly type: "rules"; readonly description: string; readonly globs: readonly string[]; readonly alwaysApply: boolean; readonly body: string }
  | { readonly type: "commands"; readonly body: string }
  | { readonly type: "agents"; readonly name: string; readonly description: string; readonly model: string | null; readonly readonly: boolean; readonly body: string }
  | { readonly type: "hooks"; readonly event: HookEvent; readonly scriptName: string; readonly script: string }
  | { readonly type: "permissions"; readonly allow: readonly string[]; readonly ask: readonly string[]; readonly deny: readonly string[] };

export type Piece = {
  readonly key: PieceKey;
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly hash: string;
  readonly body: PieceBody;
};

export type Registry = {
  readonly source: string;
  /** Git commit for git registries, null for a local path. */
  readonly commit: string | null;
  readonly root: string;
  readonly index: ReadonlyMap<PieceKey, { readonly version: string; readonly description: string }>;
  readonly presets: ReadonlyMap<PresetId, Preset>;
};

/** agents.lock */
export type Lock = {
  readonly lockfileVersion: 2;
  readonly registry: { readonly source: string; readonly commit: string | null };
  readonly targets: readonly Target[];
  readonly pieces: Readonly<Record<string, { readonly version: string; readonly hash: string }>>;
  /** Every file agent-kit writes whole, and its content hash, or `link:<target>` for a symlink, so stale ones can be removed. */
  readonly files: Readonly<Record<string, string>>;
  /** Shared files: the entries agent-kit wrote, so it can remove them later and leave the rest alone. */
  readonly owned: Readonly<Record<string, readonly string[]>>;
};

/**
 * One entry agent-kit manages inside a shared JSON file.
 * key: owns the value at path. item: owns one element of the list at path. default: sets path if absent, never owns it.
 */
export type JsonEntry = { readonly kind: "key" | "item" | "default"; readonly path: readonly string[]; readonly value: unknown };

/** A shared file: agent-kit owns some entries, the user owns everything else. TOML tables map header name -> full table text. */
export type MergedFile =
  | { readonly kind: "json"; readonly entries: readonly JsonEntry[] }
  | { readonly kind: "toml"; readonly tables: ReadonlyMap<string, string> }
  /** Plain text: agent-kit owns whole lines, such as `@AGENTS.md` in CLAUDE.md. */
  | { readonly kind: "lines"; readonly lines: readonly string[] };

export type GeneratedFile =
  | { readonly kind: "whole"; readonly content: string; readonly executable: boolean }
  /** A relative symlink, stored as-is. agent-kit owns the link, not what it points to. */
  | { readonly kind: "link"; readonly target: string }
  | MergedFile;

export type RenderResult = {
  readonly files: ReadonlyMap<string, GeneratedFile>;
  /** Text for the AGENTS.md managed section, or "" for none. */
  readonly agentsMd: string;
  /** Pieces this target cannot install at all. `check` fails on these. */
  readonly unsupported: readonly string[];
  /** Pieces installed with a loss, such as a dropped `ask` entry. `check` prints these. */
  readonly warnings: readonly string[];
};

export type Adapter = {
  readonly target: Target;
  readonly supports: ReadonlySet<PieceType>;
  readonly render: (pieces: readonly Piece[]) => RenderResult;
};
