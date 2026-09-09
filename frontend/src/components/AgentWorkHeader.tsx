import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '1s';
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds}s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export interface AgentWorkHeaderProps {
  /** Start timestamp (ms epoch) of the agent run. */
  startedAt?: number;
  /** Total duration when finished (ms). */
  durationMs?: number;
  /** True while the agent is actively running. */
  isTiming: boolean;
  /** Whether the body is expanded. */
  expanded: boolean;
  onToggle: () => void;
  /** Whether the toggle is allowed (always true except in edge cases). */
  canToggle?: boolean;
}

/**
 * Compact chip showing "Worked for Xs" or "Working for Xs…" with a chevron
 * to expand/collapse the agent activity timeline below.
 * Inspired by Hacker AI's AgentWorkHeader.tsx.
 */
export const AgentWorkHeader: React.FC<AgentWorkHeaderProps> = ({
  startedAt,
  durationMs,
  isTiming,
  expanded,
  onToggle,
  canToggle = true,
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isTiming) return;
    const effective = typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : Date.now();
    const tick = () => setElapsedMs(Math.max(0, Date.now() - effective));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isTiming, startedAt]);

  const label = isTiming
    ? `Working for ${formatDuration(elapsedMs)}`
    : typeof durationMs === 'number' && durationMs > 0
      ? `Worked for ${formatDuration(durationMs)}`
      : 'Worked';

  return (
    <button
      type="button"
      className="agent-work-header"
      data-expanded={expanded ? 'true' : 'false'}
      onClick={canToggle ? onToggle : undefined}
      aria-expanded={expanded}
      disabled={!canToggle}
    >
      <span>{label}</span>
      {canToggle && <ChevronDown size={12} className="agent-work-chevron" />}
    </button>
  );
};
