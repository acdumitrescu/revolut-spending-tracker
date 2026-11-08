import { Link, Outlet, useLocation } from 'react-router-dom';
import { APP_HUBS } from '../app/navigation';

function isSectionActive(location, item) {
  if (item.id === 'mappings') {
    return location.pathname === '/app/insights/vendors' && location.hash === '#mappings';
  }
  if (item.id === 'vendors') {
    return location.pathname === item.to && location.hash !== '#mappings';
  }
  return location.pathname === item.to;
}

export default function HubLayout({ hubId }) {
  const hub = APP_HUBS.find((item) => item.id === hubId);
  const location = useLocation();

  return (
    <div className="hub-layout">
      <header className="hub-heading">
        <div>
          <div className="eyebrow">{hub.label}</div>
          <p>{hub.description}</p>
        </div>
        <nav className="hub-tabs" aria-label={`${hub.label} sections`}>
          {hub.children.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className={`hub-tab${isSectionActive(location, item) ? ' active' : ''}`}
              aria-current={isSectionActive(location, item) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
