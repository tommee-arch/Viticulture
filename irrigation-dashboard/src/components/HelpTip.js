import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './HelpTip.css';

// Wraps any tab, button, or label with a one-line hover/focus explanation.
// Rendered via a portal into <body> and positioned with getBoundingClientRect
// so it's never clipped by the many overflow:hidden/auto panels in this app
// (map cards, the scrollable table, the chat window, etc).
export default function HelpTip({ text, children, className = '', style }) {
  const [coords, setCoords] = useState(null);
  const anchorRef = useRef(null);

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.top, left: rect.left + rect.width / 2 });
  };
  const hide = () => setCoords(null);

  if (!text) return children;

  return (
    <span
      ref={anchorRef}
      className={`help-tip-anchor ${className}`}
      style={style}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {coords && createPortal(
        <span className="help-tip-bubble" style={{ top: coords.top, left: coords.left }}>
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}
