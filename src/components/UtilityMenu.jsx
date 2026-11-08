import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileUp, Home, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UtilityMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const firstItemRef = useRef(null);

  useEffect(() => {
    const handlePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    firstItemRef.current?.focus();
    const handleKeyboard = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [open]);

  return (
    <div className="utility-menu" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className="utility-menu-trigger"
        aria-label="Open workspace menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>SS</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="utility-menu-popover" role="menu" aria-label="Workspace menu">
          <Link ref={firstItemRef} role="menuitem" to="/app/import" onClick={() => setOpen(false)}><FileUp size={16} /> Import &amp; backup</Link>
          <Link role="menuitem" to="/app/settings" onClick={() => setOpen(false)}><Settings size={16} /> Settings</Link>
          <Link role="menuitem" to="/" onClick={() => setOpen(false)}><Home size={16} /> Product home</Link>
        </div>
      )}
    </div>
  );
}
