import React, { useMemo } from 'react';

/**
 * Animated shimmer text — used inside tool blocks and status lines while
 * a tool is running. Inspired by Hacker AI's ai-elements/shimmer.tsx but
 * implemented with pure CSS (see .shimmer-text in index.css) so no extra
 * runtime cost is incurred.
 */
export const Shimmer: React.FC<{ children: string; className?: string }> = ({ children, className }) => {
  const text = useMemo(() => children, [children]);
  return <span className={`shimmer-text${className ? ' ' + className : ''}`}>{text}</span>;
};
