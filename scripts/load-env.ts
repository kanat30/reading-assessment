/**
 * Side-effect env loader for scripts. Import this FIRST — before any module
 * that reads process.env at import time (lib/scoring/ai.ts constructs the
 * Anthropic client at module scope, so a dotenv.config() call in the script
 * body runs too late: imports hoist above it).
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
