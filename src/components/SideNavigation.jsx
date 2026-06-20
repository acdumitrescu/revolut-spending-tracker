import { Link, NavLink, useLocation } from 'react-router-dom';
import { FileUp, Settings } from 'lucide-react';
import { APP_HUBS, getActiveHub } from '../app/navigation';
import AppLogo from './AppLogo';

export default function SideNavigation() {
  const location = useLocation();
  const activeHub = getActiveHub(location.pathname);

  return (
    <aside className="new-sidebar">
      <Link to="/app" className="new-sidebar-brand" aria-label="SimpleSafeBanking overview">
        <span className="new-brand-mark"><AppLogo size={21} /></span>
        <span>
          <strong>SimpleSafeBanking</strong>
          <small>Private financial clarity</small>
        </span>
      </Link>

      <nav className="primary-navigation" aria-label="Primary navigation">
        <span className="nav-section-label">Workspace</span>
        {APP_HUBS.map(({ id, to, icon: Icon, label }) => (
          <NavLink
            key={id}
            to={to}
            end={id === 'overview'}
            className={`primary-nav-item${activeHub?.id === id ? ' active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-utilities">
        <span className="nav-section-label">Manage</span>
        <NavLink to="/app/import" className="utility-nav-item">
          <FileUp size={17} /> Import &amp; backup
        </NavLink>
        <NavLink to="/app/settings" className="utility-nav-item">
          <Settings size={17} /> Settings
        </NavLink>
      </div>

      <div className="privacy-status">
        <span className="privacy-status-dot" />
        <div>
          <strong>Local-first</strong>
          <span>Your data remains under your control.</span>
        </div>
      </div>
    </aside>
  );
}
