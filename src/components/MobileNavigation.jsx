import { Link, useLocation } from 'react-router-dom';
import { APP_HUBS, getActiveHub } from '../app/navigation';

export default function MobileNavigation() {
  const location = useLocation();
  const activeHub = getActiveHub(location.pathname);

  return (
    <nav className="mobile-navigation" aria-label="Mobile navigation">
      {APP_HUBS.map(({ id, to, icon: Icon, label }) => (
        <Link key={id} to={to} className={activeHub?.id === id ? 'active' : ''}>
          <Icon size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
