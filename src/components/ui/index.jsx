import { Link } from 'react-router-dom';

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="standard-page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="standard-page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, description, actionLabel = 'Import transactions', actionTo = '/app/import' }) {
  return (
    <section className="new-empty-state">
      {Icon && <span className="new-empty-icon"><Icon size={22} /></span>}
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="btn btn-primary" to={actionTo}>{actionLabel}</Link>
    </section>
  );
}

export function ActionCard({ icon: Icon, title, description, action, children, tone = 'default' }) {
  const content = (
    <>
      {Icon && <span className="action-card-icon"><Icon size={19} /></span>}
      <span className="action-card-content">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {children}
    </>
  );

  if (typeof action === 'string') {
    return <Link className={`action-card ${tone}`} to={action}>{content}</Link>;
  }

  return <button className={`action-card ${tone}`} type="button" onClick={action}>{content}</button>;
}

export function StatusPill({ tone = 'neutral', children }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
