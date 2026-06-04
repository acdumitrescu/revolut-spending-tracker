import { useState, useEffect } from 'react';
import { useAppContext } from '../lib/AppContext';

export function FreshnessIndicator() {
  const { data } = useAppContext();
  const [now, setNow] = useState(() => new Date().getTime());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date().getTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (!data.lastUpdated) {
    return (
      <span className="freshness">
        <span className="freshness-dot empty" />
        No data
      </span>
    );
  }

  const ageMs = now - data.lastUpdated;
  const ageMin = Math.floor(ageMs / 60000);
  const ageHours = Math.floor(ageMin / 60);
  const ageDays = Math.floor(ageHours / 24);

  let label;
  if (ageMin < 1) label = 'Just now';
  else if (ageMin < 60) label = `${ageMin}m ago`;
  else if (ageHours < 24) label = `${ageHours}h ago`;
  else label = `${ageDays}d ago`;

  const stale = ageHours >= 24;

  return (
    <span className="freshness">
      <span className={`freshness-dot${stale ? ' stale' : ''}`} />
      {label} &middot; {data.transactions.length} txns
    </span>
  );
}