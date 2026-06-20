import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileUp, Home, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UtilityMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handlePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, []);

  return (
    <div className="utility-menu" ref={menuRef}>
      <button
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
        <div className="utility-menu-popover">
          <Link to="/app/import" onClick={() => setOpen(false)}><FileUp size={16} /> Import &amp; backup</Link>
          <Link to="/app/settings" onClick={() => setOpen(false)}><Settings size={16} /> Settings</Link>
          <Link to="/" onClick={() => setOpen(false)}><Home size={16} /> Product home</Link>
        </div>
      )}
    </div>
  );
}
