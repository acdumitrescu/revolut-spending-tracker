import { Link, NavLink, useLocation } from 'react-router-dom';
import { FileUp, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { APP_HUBS, getActiveHub } from '../app/navigation';

function isChildActive(location, child) {
  if (child.id === 'mappings') {
    return location.pathname === '/app/insights/vendors' && location.hash === '#mappings';
  }
  if (child.id === 'vendors') {
    return location.pathname === child.to && location.hash !== '#mappings';
  }
  return location.pathname === child.to;
}

export default function SideNavigation({ collapsed = false, onToggle }) {
  const location = useLocation();
  const activeHub = getActiveHub(location.pathname);
  const overview = APP_HUBS.find((hub) => hub.id === 'overview');
  const groupedHubs = APP_HUBS.filter((hub) => hub.id !== 'overview');
  const OverviewIcon = overview.icon;

  return (
    <aside className={`new-sidebar${collapsed ? ' is-collapsed' : ' is-expanded'}`}>
      {collapsed ? (
        <>
          <nav className="primary-navigation" aria-label="Primary navigation">
            {APP_HUBS.map(({ id, to, icon: Icon, label }) => (
              <NavLink
                key={id}
                to={to}
                end={id === 'overview'}
                className={`primary-nav-item${activeHub?.id === id ? ' active' : ''}`}
                title={label}
              >
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-utilities">
            <NavLink to="/app/import" className="utility-nav-item" title="Import and backup">
              <FileUp size={20} aria-hidden="true" /><span>Import</span>
            </NavLink>
            <NavLink to="/app/settings" className="utility-nav-item" title="Settings">
              <Settings size={20} aria-hidden="true" /><span>Settings</span>
            </NavLink>
          </div>
        </>
      ) : (
        <>
          <nav className="sidebar-expanded-navigation" aria-label="Primary navigation">
            <NavLink to={overview.to} end className="sidebar-overview-link">
              <OverviewIcon size={19} aria-hidden="true" />
              <span>{overview.label}</span>
            </NavLink>
            {groupedHubs.map((hub) => {
              const HubIcon = hub.icon;
              return (
                <section className="sidebar-navigation-group" key={hub.id} aria-labelledby={`sidebar-${hub.id}`}>
                  <div className="sidebar-group-title" id={`sidebar-${hub.id}`}>
                    <HubIcon size={16} aria-hidden="true" />
                    <span>{hub.label}</span>
                  </div>
                  <div className="sidebar-group-links">
                    {hub.children.map((child) => {
                      const Icon = child.icon;
                      const active = isChildActive(location, child);
                      return (
                        <Link
                          key={child.id}
                          to={child.to}
                          className={`sidebar-child-link${active ? ' active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </nav>
          <div className="sidebar-expanded-utilities">
            <NavLink to="/app/import"><FileUp size={17} aria-hidden="true" /><span>Import &amp; backup</span></NavLink>
            <NavLink to="/app/settings"><Settings size={17} aria-hidden="true" /><span>Settings</span></NavLink>
          </div>
        </>
      )}

      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        {!collapsed && <span>Collapse sidebar</span>}
      </button>
    </aside>
  );
}
