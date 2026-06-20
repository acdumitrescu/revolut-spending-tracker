import { NavLink, Outlet } from 'react-router-dom';
import { APP_HUBS } from '../app/navigation';

export default function HubLayout({ hubId }) {
  const hub = APP_HUBS.find((item) => item.id === hubId);

  return (
    <div className="hub-layout">
      <header className="hub-heading">
        <div>
          <div className="eyebrow">{hub.label}</div>
          <p>{hub.description}</p>
        </div>
        <nav className="hub-tabs" aria-label={`${hub.label} sections`}>
          {hub.children.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) => `hub-tab${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
