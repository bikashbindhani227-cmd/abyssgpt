import React, { useState } from 'react';
import { Check, Clipboard, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent.js';
import { AbyssLogo } from './AbyssLogo.js';
import { TodoPanel } from './TodoPanel.js';
import { AgentActivity } from './AgentActivity.js';
import type { ChatMessage } from '../types.js';
import type { ActiveAttachmentMeta, AgentActivityEvent } from '../contexts/ChatContext.js';
import type { StreamTodo } from '../lib/api.js';

interface ChatMessageItemProps {
  message: ChatMessage;
  userInitial?: string;
  isStreaming?: boolean;
  thinkingText?: string | null;
  activeAttachments?: ActiveAttachmentMeta[];
  activeTodos?: StreamTodo[];
  agentActivity?: AgentActivityEvent[];
  agentStartedAt?: number | null;
  agentFinishedAt?: number | null;
  onRegenerate?: () => void;
  onDelete?: (id: string) => void;
  onToast: (text: string) => void;
}

function friendlyStatus(raw: string | null): string {
  if (!raw) return 'Thinking…';
  const t = raw.toLowerCase();
  if (t.includes('search')) return 'Searching the web…';
  if (t.includes('read')) return 'Reading sources…';
  if (t.includes('writ') || t.includes('creat')) return 'Writing files…';
  if (t.includes('command') || t.includes('terminal')) return 'Executing commands…';
  if (t.includes('test') || t.includes('verify')) return 'Running tests…';
  if (t.includes('fix') || t.includes('repair')) return 'Fixing errors…';
  if (t.includes('run') || t.includes('execut') || t.includes('code')) return 'Running code…';
  if (t.includes('finish') || t.includes('wrap') || t.includes('review') || t.includes('answer')) return 'Finalizing answer…';
  if (t.includes('plan') || t.includes('approach') || t.includes('task')) return 'Planning the task…';
  return raw;
}

export const ChatMessageItemBase: React.FC<ChatMessageItemProps> = ({
  message,
  userInitial = 'U',
  isStreaming = false,
  thinkingText,
  activeAttachments,
  activeTodos,
  agentActivity,
  agentStartedAt,
  agentFinishedAt,
  onRegenerate,
  onDelete,
  onToast,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      onToast('Copied to clipboard');
    } catch {
      onToast('Could not copy — clipboard unavailable');
    }
  };

  const hasAttachments = !isUser && activeAttachments && activeAttachments.length > 0;
  const hasTodos = !isUser && activeTodos && activeTodos.length > 0;
  const hasActivity = !isUser && agentActivity && agentActivity.length > 0;
  const isPendingFirstToken = !isUser && isStreaming && !message.content;

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="msg-avatar" aria-hidden="true">
        {isUser ? userInitial : <AbyssLogo size={18} />}
      </div>
      <div className="msg-body">
        <div className="msg-role">{isUser ? 'You' : 'AbyssGPT'}</div>

        {hasAttachments && (
          <div className="composer-attachments" style={{ padding: 0, marginBottom: 6 }}>
            {activeAttachments.map((att, idx) => (
              <div
                key={`${att.filename}-${idx}`}
                className={`attachment-chip${att.rejected ? ' attachment-rejected' : ''}`}
                title={att.rejected ? att.rejectionReason : att.filename}
              >
                <span className="attachment-icon">
                  {att.rejected || !att.hasTextContent ? '⚠' : '📄'}
                </span>
                <span className="attachment-name">{att.filename}</span>
              </div>
            ))}
          </div>
        )}

        {hasTodos && <TodoPanel todos={activeTodos} />}

        {hasActivity && (
          <AgentActivity
            items={agentActivity}
            isStreaming={isStreaming}
            startedAt={agentStartedAt ?? null}
            finishedAt={agentFinishedAt ?? null}
          />
        )}

        {isPendingFirstToken && (
          <div className="status-line" role="status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <span>{friendlyStatus(thinkingText || null)}</span>
          </div>
        )}

        {(Boolean(message.content) || (!isStreaming && !isPendingFirstToken)) && (
          <div className="msg-content">
            {isUser ? (
              message.content
            ) : (
              <MarkdownContent content={message.content} onToast={onToast} />
            )}
            {isStreaming && <span className="stream-caret" aria-hidden="true" />}
          </div>
        )}

        {!isStreaming && !message.isError && (
          <div className="msg-actions">
            <button
              type="button"
              onClick={handleCopy}
              title="Copy message"
              aria-label={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? <Check size={15} /> : <Clipboard size={15} />}
            </button>

            {!isUser && onRegenerate && (
              <button type="button" onClick={onRegenerate} title="Regenerate response" aria-label="Regenerate response">
                <RotateCcw size={15} />
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                title="Delete message"
                aria-label="Delete message"
                className="danger"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}

        {message.isError && (
          <div className="inline-error" role="alert">
            <AlertTriangle size={16} />
            <span className="flex-1">{message.errorText || 'Something went wrong while generating this response.'}</span>
            {onRegenerate && (
              <button type="button" className="retry-btn" onClick={onRegenerate}>
                <RotateCcw size={13} />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatMessageItem = React.memo(ChatMessageItemBase, (prev, next) =>
  prev.message.id === next.message.id &&
  prev.message.clientKey === next.message.clientKey &&
  prev.message.content === next.message.content &&
  prev.message.isError === next.message.isError &&
  prev.message.errorText === next.message.errorText &&
  prev.userInitial === next.userInitial &&
  prev.isStreaming === next.isStreaming &&
  prev.thinkingText === next.thinkingText &&
  prev.activeAttachments === next.activeAttachments &&
  prev.activeTodos === next.activeTodos &&
  prev.agentActivity === next.agentActivity &&
  prev.agentStartedAt === next.agentStartedAt &&
  prev.agentFinishedAt === next.agentFinishedAt &&
  prev.onRegenerate === next.onRegenerate &&
  prev.onDelete === next.onDelete &&
  prev.onToast === next.onToast
);
