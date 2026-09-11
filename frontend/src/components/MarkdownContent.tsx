import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Clipboard } from 'lucide-react';
import type { Components } from 'react-markdown';

const remarkPlugins = [remarkGfm];

interface MarkdownContentProps {
  content: string;
  onToast: (text: string) => void;
}

/** Extract raw text from react-markdown children. */
function toText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (React.isValidElement(node)) return toText((node.props as { children?: React.ReactNode }).children);
  return '';
}

/** Copy button with transient success state for code blocks. */
const CodeCopyButton: React.FC<{ code: string; onToast: (t: string) => void }> = ({ code, onToast }) => {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className="codeblock-copy"
      aria-label={copied ? 'Copied' : 'Copy code'}
      onClick={() => {
        const done = () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
          onToast('Code copied');
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(code).then(done, () => onToast('Could not copy'));
        } else {
          onToast('Clipboard unavailable');
        }
      }}
    >
      {copied ? <Check size={13} /> : <Clipboard size={13} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
};

const markdownComponents = (onToast: (t: string) => void): Components => ({
  code({ className, children, ...props }) {
    const match = /language-([\w+-]+)/.exec(className || '');
    const codeText = toText(children).replace(/\n$/, '');

    // react-markdown v9+ no longer passes an `inline` prop: a fenced block
    // either carries a language class or spans multiple lines.
    const isBlock = Boolean(match) || codeText.includes('\n');

    if (isBlock) {
      return (
        <div className="codeblock">
          <div className="codeblock-head">
            <span className="codeblock-lang">{match ? match[1] : 'code'}</span>
            <CodeCopyButton code={codeText} onToast={onToast} />
          </div>
          <pre>
            <code className={className}>{codeText}</code>
          </pre>
        </div>
      );
    }

    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
  // Tables scroll safely inside a rounded container on narrow screens.
  table({ children, ...props }) {
    return (
      <div className="md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
  // External links open in a new tab without leaking the app context.
  a({ children, href, ...props }) {
    const external = /^https?:\/\//i.test(href || '');
    return (
      <a
        href={href}
        {...props}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
});

class MarkdownErrorBoundary extends React.Component<
  { content: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { content: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Markdown parsing issue handled safely:', error);
  }

  componentDidUpdate(prevProps: { content: string }) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="msg-content-fallback" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {this.props.content}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Shared markdown renderer for AbyssGPT responses.
 * Used for finished messages AND the live-streaming answer so formatting
 * appears correctly as it streams in. react-markdown escapes raw HTML,
 * keeping rendering XSS-safe.
 */
const MarkdownContentBase: React.FC<MarkdownContentProps> = ({ content, onToast }) => {
  const components = React.useMemo(() => markdownComponents(onToast), [onToast]);

  return (
    <MarkdownErrorBoundary content={content}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </MarkdownErrorBoundary>
  );
};

export const MarkdownContent = memo(
  MarkdownContentBase,
  (prev, next) => prev.content === next.content && prev.onToast === next.onToast
);
