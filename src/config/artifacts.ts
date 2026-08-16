export type ArtifactMode = 'off' | 'on' | 'retain-on-failure';

export function parseArtifactMode(value: string | undefined, fallback: ArtifactMode): ArtifactMode {
  const normalized = (value || fallback).trim().toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(normalized)) return 'on';
  if (['off', 'false', '0', 'no'].includes(normalized)) return 'off';
  if (['retain-on-failure', 'on-failure', 'failure'].includes(normalized)) return 'retain-on-failure';
  return fallback;
}

/** Start recording / tracing when the mode is on or retain-on-failure. */
export function shouldRecordArtifact(mode: ArtifactMode): boolean {
  return mode === 'on' || mode === 'retain-on-failure';
}

/** Keep or capture the artifact for this result. */
export function shouldKeepArtifact(mode: ArtifactMode, failed: boolean): boolean {
  if (mode === 'on') return true;
  if (mode === 'retain-on-failure') return failed;
  return false;
}
