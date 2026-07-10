import Anthropic from "@anthropic-ai/sdk";

// Single source of truth for the Claude model used by the scoring pipeline.
// Use a current alias from the Anthropic docs — never a hand-constructed
// dated snapshot (an invalid "claude-sonnet-4-5-20250514" once 404'd three
// call sites for weeks, silently degrading every AI feature to fallbacks).
export const CLAUDE_MODEL = "claude-sonnet-4-6";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Scoring AI calls degrade to deterministic fallbacks on failure, which is
// invisible to teachers by design. It must never be invisible to us: route
// every fallback through here so failures are greppable in Vercel logs.
export function logAiFallback(feature: string, error: unknown) {
  console.error(
    `[AI-FALLBACK] ${feature}: Claude call failed; deterministic fallback used.`,
    error
  );
}
