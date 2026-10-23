import type { Adapter, Target } from "../types.ts";
import { claude } from "./claude.ts";
import { codex } from "./codex.ts";
import { cursor } from "./cursor.ts";

/** Adding a target means adding one entry here. */
export const ADAPTERS: Readonly<Record<Target, Adapter>> = { cursor, claude, codex };
