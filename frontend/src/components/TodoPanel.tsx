import React, { useState } from 'react';
import { ChevronDown, ListTodo, Circle, CheckCircle2, Loader2, XCircle, CircleArrowRight } from 'lucide-react';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

function statusIcon(status: TodoStatus): React.ReactNode {
  switch (status) {
    case 'completed': return <CheckCircle2 size={14} />;
    case 'in_progress': return <Loader2 size={14} className="agent-activity-spin" />;
    case 'cancelled': return <XCircle size={14} />;
    default: return <Circle size={14} />;
  }
}

function itemClass(status: TodoStatus): string {
  switch (status) {
    case 'completed': return 'todo-item todo-completed';
    case 'in_progress': return 'todo-item todo-in-progress';
    case 'cancelled': return 'todo-item todo-cancelled';
    default: return 'todo-item';
  }
}

export interface TodoPanelProps {
  todos: Todo[];
  /** When true, the panel is rendered expanded by default. */
  defaultExpanded?: boolean;
}

/**
 * Compact todo panel — the agent writes tasks via todo_write and the user
 * sees a progress tracker. Collapsed by default; click to expand.
 *
 * Inspired by Hacker AI's TodoPanel.tsx but adapted to AbyssGPT's per-message
 * todo list (one panel per assistant message that produced todos).
 */
export const TodoPanel: React.FC<TodoPanelProps> = ({ todos, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!todos.length) return null;

  const stats = {
    total: todos.length,
    done: todos.filter((t) => t.status === 'completed').length,
    inProgress: todos.filter((t) => t.status === 'in_progress').length,
  };
  const current = todos.find((t) => t.status === 'in_progress');

  const headerText = current
    ? current.content
    : stats.done === 0
      ? `${stats.total} task${stats.total === 1 ? '' : 's'}`
      : `${stats.done} of ${stats.total} done`;

  return (
    <div className="todo-panel" data-expanded={expanded ? 'true' : 'false'}>
      <button
        type="button"
        className="todo-panel-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse task list' : 'Expand task list'}
      >
        <span className="todo-panel-icon">{expanded || !current ? <ListTodo size={14} /> : <CircleArrowRight size={14} />}</span>
        <span>{headerText}</span>
        <span className="todo-panel-counter">{stats.done}/{stats.total}</span>
        <ChevronDown size={13} className="todo-panel-chevron" />
      </button>
      {expanded && (
        <div className="todo-panel-body">
          {todos.map((todo) => (
            <div key={todo.id} className={itemClass(todo.status)}>
              <span className="todo-status-icon">{statusIcon(todo.status)}</span>
              <span>{todo.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
