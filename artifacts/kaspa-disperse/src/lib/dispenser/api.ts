export const KASPA_API_FALLBACK_ORIGIN = 'https://kasdistro.replit.app';

export function kaspaApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  return KASPA_API_FALLBACK_ORIGIN;
}
