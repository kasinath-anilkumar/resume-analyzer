import React from 'react';

// Minimal, safe markdown for recruiter-written job descriptions. Renders
// **bold** / __bold__ and *italic* / _italic_ as real elements and preserves
// line breaks (via CSS). No dependency, and no dangerouslySetInnerHTML — the
// text is turned into React nodes, so nothing can inject markup.

// Match bold FIRST (so ** wins over *), then italic. Italic tokens can't span a
// '*'/'_' or newline, so they never swallow a bold token.
const TOKEN = /(\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;

const parseInline = (text) => {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={i}>{t.slice(2, -2)}</strong>);
    else out.push(<em key={i}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

/**
 * Render lightly-formatted text (bold/italic + line breaks).
 * @param {{ text?: string, className?: string }} props
 */
const RichText = ({ text, className = '' }) => {
  if (!text) return null;
  return <span className={`whitespace-pre-line ${className}`}>{parseInline(String(text))}</span>;
};

export default RichText;
