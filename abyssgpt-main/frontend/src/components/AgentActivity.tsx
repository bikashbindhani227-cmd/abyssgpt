import React, { useMemo, useState } from 'react';
import { Brain, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface AgentActivityProps {
  steps: string[];
  active?: boolean;
}

/**
 * Safe agent activity presentation inspired by modern agent UIs.
 * It intentionally shows only coarse execution states, never private
 * chain-of-thought or hidden model reasoning.
 */
export const AgentActivity: React.FC<AgentActivityProps> = ({ steps, active = false }) => {
  const [open, setOpen] = useState(true);

  const normalized = useMemo(() => {
    const seen = new Set<string>();
    return steps
      .map((step) => step.trim())
      .filter(Boolean)
      .filter((step) => {
        const key = step.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [steps]);

  if (!normalized.length && !active) return null;

  const current = normalized[normalized.length - 1] || 'Thinking';

  return (
    <div className="agent-activity" data-testid="agent-activity">
      <button
        type="button"
        className="agent-activity-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Collapse agent activity' : 'Expand agent activity'}
      >
        {active ? (
          <Loader2 className="agent-activity-icon spin" size={15} aria-hidden="true" />
        ) : (
          <Brain className="agent-activity-icon" size={15} aria-hidden="true" />
        )}
        <span className={active ? 'agent-activity-current shimmer-text' : 'agent-activity-current'}>
          {current}
        </span>
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
      </button>

      {open && normalized.length > 0 && (
        <div className="agent-activity-list" role="list" aria-label="Agent activity">
          {normalized.map((step, index) => {
            const isLast = index === normalized.length - 1;
            return (
              <div className="agent-activity-step" role="listitem" key={`${step}-${index}`}>
                <span className={`agent-activity-check${isLast && active ? ' active' : ''}`}>
                  {isLast && active ? <Loader2 size={12} className="spin" /> : <Check size={11} />}
                </span>
                <span>{step}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
