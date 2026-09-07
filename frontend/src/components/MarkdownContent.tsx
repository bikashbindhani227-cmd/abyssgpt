import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Clipboard } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { PluggableList } from 'unified';

// `remark-gfm`'s plugin type does not structurally unify with unified's
// PluggableList under every TS resolution layout (both are the same
// unified v11 at runtime) — this cast is compile-time only.
const remarkPlugins = [remarkGfm] as unknown as PluggableList;

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

/**
 * Full markdown renderer for finished messages. react-markdown escapes raw
 * HTML, keeping rendering XSS-safe.
 */
const MarkdownContentBase: React.FC<MarkdownContentProps> = ({ content, onToast }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents(onToast)}>
      {content}
    </ReactMarkdown>
  );
};

export const MarkdownContent = memo(
  MarkdownContentBase,
  (prev, next) => prev.content === next.content && prev.onToast === next.onToast
);

/* ============================================================
   STREAMING RENDERER (performance)

   Re-parsing the entire accumulated text with react-markdown on
   every stream flush makes long responses progressively slower.
   Instead, the text is split at the last blank line into:
     - a STABLE prefix of completed blocks, memoized on its string
       value so react-markdown parses it exactly once, and
     - a small LIVE tail (the paragraph currently being written)
       that is the only part re-parsed per flush.

   The split is fence-aware: if the prefix ends inside an unclosed
   ``` code fence, the boundary moves up to include the opening
   fence line in the tail, so the fence is never mis-parsed.
   Minor edge cases (e.g. setext headings) only affect the transient
   stream view — the finished message always renders through the
   full MarkdownContent above.
   ============================================================ */

const FENCE_LINE = /^\s{0,3}(```|~~~)/;

function countFenceLines(block: string): number {
  let count = 0;
  let lineStart = 0;
  for (let i = 0; i <= block.length; i++) {
    if (i === block.length || block[i] === '\n') {
      if (FENCE_LINE.test(block.slice(lineStart, i))) count++;
      lineStart = i + 1;
    }
  }
  return count;
}

/** Split at a line boundary so prefix + tail always reconstruct the text. */
export function splitStreamingMarkdown(text: string): [string, string] {
  const idx = text.lastIndexOf('\n\n');
  if (idx === -1) return ['', text];

  let cut = idx + 2; // just after the blank line
  if (cut >= text.length) return [text, ''];

  if (countFenceLines(text.slice(0, cut)) % 2 === 1) {
    // The stable prefix would end inside an unclosed code fence — move the
    // boundary up to the start of that fence's opening line.
    const prefix = text.slice(0, cut);
    let lineStart = 0;
    let lastOpener = -1;
    for (let i = 0; i <= prefix.length; i++) {
      if (i === prefix.length || prefix[i] === '\n') {
        if (FENCE_LINE.test(prefix.slice(lineStart, i))) lastOpener = lineStart;
        lineStart = i + 1;
      }
    }
    cut = lastOpener >= 0 ? lastOpener : 0;
  }

  return [text.slice(0, cut), text.slice(cut)];
}

const StreamingMarkdownBase: React.FC<MarkdownContentProps> = ({ content, onToast }) => {
  const [stable, tail] = useMemo(() => splitStreamingMarkdown(content), [content]);
  return (
    <>
      {stable && <MarkdownContentBase content={stable} onToast={onToast} />}
      <MarkdownContentBase content={tail} onToast={onToast} />
    </>
  );
};

export const StreamingMarkdown = memo(
  StreamingMarkdownBase,
  (prev, next) => prev.content === next.content && prev.onToast === next.onToast
);
