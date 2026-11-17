import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

// One explanation per card. A disclosure button (not a hover-only title) so keyboard and touch
// users reach it; the panel stays in the DOM, hidden, so aria-controls always resolves.
export default function InfoPopover({ label, children }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <span
      className="dash-info"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          rootRef.current?.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        className="dash-info-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`About ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <div id={panelId} className="dash-info-panel" hidden={!open}>
        {children}
      </div>
    </span>
  );
}
