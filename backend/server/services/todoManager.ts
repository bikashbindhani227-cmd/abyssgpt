/**
 * AbyssGPT — Per-request Todo Manager
 * ====================================
 *
 * Inspired by Hacker AI's todo_write tool: lets the agent maintain a visible
 * task list during multi-step work. Per-request (in-memory, not persisted) —
 * each chat invocation gets its own manager instance.
 *
 * The agent writes todos; the SSE route subscribes to changes and emits
 * `todo` events to the client so the user sees a compact progress panel.
 *
 *   AGENT calls todo_write({ todos: [...] })
 *        ↓
 *   TodoManager.setTodos / mergeTodos
 *        ↓
 *   onChanges callback fires
 *        ↓
 *   route emits `todo` SSE event with the new list
 *        ↓
 *   client renders TodoPanel (collapsed by default, expands on click)
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface TodoStats {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  cancelled: number;
}

export type TodoChangeListener = (todos: Todo[]) => void;

const MAX_TODOS = 30;
const MAX_CONTENT_LENGTH = 280;
const MAX_ID_LENGTH = 64;

function normalizeStatus(value: unknown): TodoStatus {
  const raw = String(value ?? 'pending').toLowerCase().trim();
  if (raw === 'in_progress' || raw === 'inprogress' || raw === 'in-progress' || raw === 'running' || raw === 'active') return 'in_progress';
  if (raw === 'completed' || raw === 'done' || raw === 'complete' || raw === 'finished') return 'completed';
  if (raw === 'cancelled' || raw === 'canceled' || raw === 'skipped') return 'cancelled';
  return 'pending';
}

function sanitizeContent(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, MAX_CONTENT_LENGTH);
}

function sanitizeId(value: unknown): string {
  const raw = String(value ?? '').trim().slice(0, MAX_ID_LENGTH);
  if (!raw) return `todo_${Math.random().toString(36).slice(2, 10)}`;
  return raw;
}

/**
 * In-memory todo list for a single agent run. The route constructs one per
 * request, passes it into the executor, and forwards change events to the SSE
 * client. No persistence — completed todos disappear after the request ends.
 */
export class TodoManager {
  private todos: Todo[] = [];
  private listeners = new Set<TodoChangeListener>();

  /** Subscribe to changes. Returns an unsubscribe function. */
  onChange(listener: TodoChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = [...this.todos];
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch { /* listener failures are non-fatal */ }
    }
  }

  getAllTodos(): Todo[] {
    return [...this.todos];
  }

  getStats(): TodoStats {
    const stats: TodoStats = { total: this.todos.length, done: 0, inProgress: 0, pending: 0, cancelled: 0 };
    for (const todo of this.todos) {
      if (todo.status === 'completed') stats.done += 1;
      else if (todo.status === 'in_progress') stats.inProgress += 1;
      else if (todo.status === 'pending') stats.pending += 1;
      else if (todo.status === 'cancelled') stats.cancelled += 1;
    }
    return stats;
  }

  /**
   * Replace or merge the todo list. Mirrors Hacker AI's todo_write semantics.
   *
   * `merge: true` updates matching IDs without dropping the others; partial
   * updates (missing content/status) are tolerated.
   */
  setTodos(incoming: Array<Partial<Todo> & { id: string }>, merge: boolean): Todo[] {
    const sanitized = incoming
      .map((t) => ({
        id: sanitizeId(t.id),
        content: t.content !== undefined ? sanitizeContent(t.content) : undefined,
        status: t.status !== undefined ? normalizeStatus(t.status) : undefined,
      }))
      .filter((t) => t.content !== undefined || merge)
      .slice(0, MAX_TODOS);

    if (merge) {
      const byId = new Map(this.todos.map((t) => [t.id, t]));
      for (const item of sanitized) {
        const existing = byId.get(item.id);
        if (existing) {
          if (item.content !== undefined) existing.content = item.content;
          if (item.status !== undefined) existing.status = item.status;
        } else if (item.content !== undefined) {
          byId.set(item.id, {
            id: item.id,
            content: item.content,
            status: item.status ?? 'pending',
          });
        }
      }
      this.todos = Array.from(byId.values()).slice(0, MAX_TODOS);
    } else {
      this.todos = sanitized
        .filter((t) => t.content !== undefined)
        .map((t) => ({
          id: t.id,
          content: t.content!,
          status: t.status ?? 'pending',
        }));
    }

    // Auto-mark the first pending as in_progress if nothing is in progress.
    const stats = this.getStats();
    if (stats.inProgress === 0 && stats.pending > 0) {
      const firstPending = this.todos.find((t) => t.status === 'pending');
      if (firstPending) firstPending.status = 'in_progress';
    }

    this.emit();
    return [...this.todos];
  }
}

/** Helper: serialize todos for inclusion in tool-response payload back to the model. */
export function summarizeTodosForModel(todos: Todo[]): string {
  if (!todos.length) return 'No todos are currently tracked.';
  const lines = todos.map((t) => `- [${t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '~' : t.status === 'cancelled' ? '-' : ' '}] ${t.content}`);
  return `Current task list:\n${lines.join('\n')}`;
}
