/**
 * Branding is deployment-specific. Defaults to a generic name so the web UI is
 * a drop-in reference client for any publisher-analytics-agent deployment.
 *
 * Override via env vars:
 *   NEXT_PUBLIC_AGENT_NAME      — display name (default: "Publisher Analytics")
 *   NEXT_PUBLIC_AGENT_TAGLINE   — header subtitle (default: "Yield analytics on AdCP")
 *   NEXT_PUBLIC_AGENT_INITIAL   — single-letter avatar (default: first letter of name)
 *
 * NEXT_PUBLIC_* vars are inlined at build time and exposed to the browser.
 */

const DEFAULT_NAME = 'Publisher Analytics';
const DEFAULT_TAGLINE = 'Yield analytics on AdCP';

export const agentName = process.env.NEXT_PUBLIC_AGENT_NAME?.trim() || DEFAULT_NAME;
export const agentTagline = process.env.NEXT_PUBLIC_AGENT_TAGLINE?.trim() || DEFAULT_TAGLINE;
export const agentInitial = (process.env.NEXT_PUBLIC_AGENT_INITIAL?.trim() || agentName[0] || 'A').slice(0, 1).toUpperCase();
