import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ChatComposerProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const MAX_HEIGHT = 200;

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to a controlled maximum.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  const handleSend = () => {
    const clean = text.trim();
    if (!clean || isStreaming || disabled) return;
    onSend(clean);
    setText('');
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
  };

  const canSend = Boolean(text.trim()) && !disabled;

  return (
    <div className="composer-wrap">
      <div className={`composer${focused ? ' focused' : ''}${disabled && !isStreaming ? ' disabled' : ''}`}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={disabled && !isStreaming ? 'Daily message limit reached' : 'Ask anything…'}
          aria-label="Message AbyssGPT"
          className="abyss-input"
          disabled={disabled && !isStreaming}
        />
        <div className="composer-tools composer-tools-end">
          <div className="tools-right">
            {isStreaming ? (
              <button type="button" className="send stop" onClick={onStop} aria-label="Stop generating">
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="send"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send message"
              >
                <ArrowUp size={18} strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-foot">AbyssGPT can make mistakes — verify important information.</div>
    </div>
  );
};
