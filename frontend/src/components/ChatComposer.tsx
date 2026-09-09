import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Paperclip, X, FileText, FileWarning, Sparkles } from 'lucide-react';
import { useChat, type PendingAttachment } from '../contexts/ChatContext.js';

interface ChatComposerProps {
  onSend: (message: string, attachments?: PendingAttachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const MAX_HEIGHT = 200;
const MAX_FILE_SIZE_BYTES = 1_500_000; // 1.5 MB per file (matches backend limit)

const TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.csv', '.tsv', '.xml',
  '.html', '.htm', '.css', '.scss', '.less', '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.php', '.pl', '.lua', '.r', '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.sql', '.graphql', '.gql', '.proto', '.toml', '.ini', '.cfg', '.conf',
  '.env', '.gitignore',
];

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (['application/json', 'application/javascript', 'application/x-yaml', 'application/yaml', 'application/x-sh', 'application/sql'].includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file);
  });
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}) => {
  const {
    pendingAttachments,
    addAttachment,
    removeAttachment,
    agentStartedAt,
    agentFinishedAt,
  } = useChat();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  const handleSend = useCallback(() => {
    const clean = text.trim();
    if ((!clean && pendingAttachments.length === 0) || isStreaming || disabled) return;
    onSend(clean || '(no message)', pendingAttachments.length > 0 ? pendingAttachments : undefined);
    setText('');
    setAttachError(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
  }, [text, pendingAttachments, isStreaming, disabled, onSend]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // reset so the same file can be re-attached
    if (!files.length) return;
    setAttachError(null);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setAttachError(`${file.name} exceeds the 1.5 MB per-file limit.`);
        continue;
      }
      if (file.size === 0) {
        setAttachError(`${file.name} is empty.`);
        continue;
      }
      const isText = isTextFile(file);
      const content = isText ? await readAsText(file).catch(() => null) : null;
      addAttachment({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        content,
        size: file.size,
      });
    }
  }, [addAttachment]);

  const canSend = (Boolean(text.trim()) || pendingAttachments.length > 0) && !disabled;
  const isAgentMode = isStreaming || (agentStartedAt !== null && agentFinishedAt === null);

  return (
    <div className="composer-wrap">
      {attachError && (
        <div style={{
          padding: '6px 12px',
          marginBottom: 4,
          color: 'var(--error)',
          fontSize: 11.5,
        }}>
          {attachError}
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="composer-attachments">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className={`attachment-chip${att.content === null ? ' attachment-rejected' : ''}`}
              title={att.content === null ? 'Binary files cannot be read; the agent will be told the file exists.' : att.filename}
            >
              <span className="attachment-icon">
                {att.content === null ? <FileWarning size={12} /> : <FileText size={12} />}
              </span>
              <span className="attachment-name">{att.filename}</span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeAttachment(att.id)}
                aria-label={`Remove ${att.filename}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
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
          <div className="tools-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="composer-toolbar-btn"
              onClick={handleAttachClick}
              disabled={!isOnline() || disabled && !isStreaming}
              aria-label="Attach file"
              title="Attach a text or code file (max 1.5 MB)"
            >
              <Paperclip size={15} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
              accept=".txt,.md,.markdown,.json,.yaml,.yml,.csv,.tsv,.xml,.html,.htm,.css,.scss,.less,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.php,.pl,.lua,.r,.sh,.bash,.zsh,.fish,.ps1,.sql,.graphql,.gql,.proto,.toml,.ini,.cfg,.conf,.env,.gitignore,text/*,application/json,application/javascript,application/x-yaml,application/yaml,application/x-sh,application/sql"
            />
            {isAgentMode && (
              <span className="composer-mode-pill composer-mode-agent" title="Agent mode — the assistant will use tools automatically as needed">
                <span className="composer-mode-dot" />
                Agent
              </span>
            )}
            {!isAgentMode && !isStreaming && (
              <span className="composer-mode-pill" title="The assistant will respond directly for simple tasks">
                <Sparkles size={11} />
                Ask
              </span>
            )}
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

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
