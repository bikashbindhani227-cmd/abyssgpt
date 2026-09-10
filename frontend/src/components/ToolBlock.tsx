import React from 'react';
import {
  Search,
  ExternalLink,
  Code2,
  ListTodo,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Terminal,
  FileCode2,
  FileSearch,
  Layers,
} from 'lucide-react';
import { Shimmer } from './Shimmer.js';

export type ToolBlockStatus = 'running' | 'done' | 'error';

function iconForTool(tool: string, status: ToolBlockStatus): React.ReactNode {
  if (status === 'running') return <Loader2 size={14} className="agent-activity-spin" />;
  if (status === 'error') return <AlertCircle size={14} />;
  switch (tool) {
    case 'web_search': return <Search size={14} />;
    case 'read_url': return <ExternalLink size={14} />;
    case 'run_code': return <Code2 size={14} />;
    case 'run_command': return <Terminal size={14} />;
    case 'file_write': return <FileCode2 size={14} />;
    case 'file_read': return <FileSearch size={14} />;
    case 'project_state': return <Layers size={14} />;
    case 'todo_write': return <ListTodo size={14} />;
    default: return <CheckCircle2 size={14} />;
  }
}

function actionLabel(tool: string, status: ToolBlockStatus): string {
  const running = status === 'running';
  switch (tool) {
    case 'web_search': return running ? 'Searching the web' : 'Searched the web';
    case 'read_url': return running ? 'Reading source' : 'Read source';
    case 'run_code': return running ? 'Running code' : 'Ran code';
    case 'run_command': return running ? 'Executing command' : 'Executed command';
    case 'file_write': return running ? 'Writing file' : 'Wrote file';
    case 'file_read': return running ? 'Reading file' : 'Read file';
    case 'project_state': return running ? 'Syncing project state' : 'Synced project state';
    case 'todo_write': return running ? 'Updating tasks' : 'Updated tasks';
    default: return running ? 'Working' : 'Done';
  }
}

export interface ToolBlockProps {
  tool: string;
  status: ToolBlockStatus;
  target?: string;
  onClick?: () => void;
  clickable?: boolean;
}

/**
 * Compact pill that summarizes one tool call with full support for general-purpose
 * software engineering tools (files, terminal commands, project state, sandbox execution).
 */
export const ToolBlock: React.FC<ToolBlockProps> = ({ tool, status, target, onClick, clickable }) => {
  const cls = `tool-block${status === 'error' ? ' tool-block-error' : status === 'done' ? ' tool-block-done' : ''}`;
  const label = actionLabel(tool, status);
  const inner = (
    <>
      <span className="tool-block-icon">{iconForTool(tool, status)}</span>
      {status === 'running' ? <Shimmer>{label}</Shimmer> : <span className="tool-block-action">{label}</span>}
      {target && <span className="tool-block-target">{target}</span>}
    </>
  );
  if (clickable && onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
};
