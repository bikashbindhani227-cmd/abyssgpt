import React, { useState } from 'react';
import { Check, Clipboard, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent.js';
import { AbyssLogo } from './AbyssLogo.js';
import type { ChatMessage } from '../types.js';

interface ChatMessageItemProps {
  message: ChatMessage;
  userInitial?: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onDelete?: (id: string) => void;
  onToast: (text: string) => void;
}

export const ChatMessageItemBase: React.FC<ChatMessageItemProps> = ({
  message,
  userInitial = 'U',
  isStreaming = false,
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

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="msg-avatar" aria-hidden="true">
        {isUser ? userInitial : <AbyssLogo size={18} />}
      </div>
      <div className="msg-body">
        <div className="msg-role">{isUser ? 'You' : 'AbyssGPT'}</div>
        <div className="msg-content">
          {isUser ? message.content : <MarkdownContent content={message.content} onToast={onToast} />}
          {isStreaming && <span className="stream-caret" aria-hidden="true" />}
        </div>

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

          {onDelete && !isStreaming && (
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
  prev.message === next.message &&
  prev.userInitial === next.userInitial &&
  prev.isStreaming === next.isStreaming &&
  prev.onRegenerate === next.onRegenerate &&
  prev.onDelete === next.onDelete &&
  prev.onToast === next.onToast
);
