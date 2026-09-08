import React, { useMemo, useState } from 'react';
import { Brain, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, Search, Terminal, Globe } from 'lucide-react';
import type { AgentToolEvent } from '../types.js';

interface AgentActivityProps {
  steps?: string[];
  events?: AgentToolEvent[];
  active?: boolean;
  compact?: boolean;
}

const toolMeta = (name: string) => {
  if (name === 'web_search') return { label: 'Search the web', icon: Search };
  if (name === 'read_url') return { label: 'Read source', icon: Globe };
  if (name === 'run_code') return { label: 'Run code', icon: Terminal };
  return { label: 'Use tool', icon: Brain };
};

export const AgentActivity: React.FC<AgentActivityProps> = ({ steps = [], events = [], active = false, compact = false }) => {
  const [open, setOpen] = useState(active);
  const normalized = useMemo(() => {
    const seen = new Set<string>();
    return steps.map((step) => step.trim()).filter(Boolean).filter((step) => {
      const key = step.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [steps]);

  if (!normalized.length && !events.length && !active) return null;
  const current = normalized[normalized.length - 1] || (active ? 'Working' : 'Completed');

  return (
    <div className={`agent-activity${compact ? ' compact' : ''}`} data-testid="agent-activity">
      <button type="button" className="agent-activity-trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {active ? <Loader2 className="agent-activity-icon spin" size={15} /> : <Brain className="agent-activity-icon" size={15} />}
        <span className={active ? 'agent-activity-current shimmer-text' : 'agent-activity-current'}>{current}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (normalized.length > 0 || events.length > 0) && (
        <div className="agent-activity-panel">
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

          {events.map((event, index) => {
            const meta = toolMeta(event.name);
            const Icon = meta.icon;
            const pending = event.status === 'started' && active;
            return (
              <div className="agent-tool-card" key={`${event.name}-${event.target || ''}-${index}`}>
                <div className="agent-tool-icon"><Icon size={14} /></div>
                <div className="agent-tool-main">
                  <div className="agent-tool-title">
                    <span>{pending ? meta.label : event.status === 'failed' ? `${meta.label} failed` : meta.label}</span>
                    {pending ? <Loader2 size={12} className="spin" /> : event.status === 'completed' ? <Check size={12} /> : null}
                  </div>
                  {event.target && <div className="agent-tool-target">{event.target}</div>}
                  {event.sources && event.sources.length > 0 && (
                    <div className="agent-source-list">
                      {event.sources.slice(0, 6).map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="agent-source-link">
                          <span>{source.title || source.url}</span><ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  )}
                  {event.preview && !event.sources?.length && <div className="agent-tool-preview">{event.preview}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
