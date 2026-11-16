import InfoPopover from './InfoPopover';

/** A labelled region: one heading, one optional info popover, body content. */
export default function DashboardCard({ id, title, info, className = '', children }) {
  const headingId = `dash-${id}-heading`;
  return (
    <section className={`dash-card ${className}`.trim()} aria-labelledby={headingId}>
      <header className="dash-card-head">
        <h2 id={headingId}>{title}</h2>
        {info && <InfoPopover label={title}>{info}</InfoPopover>}
      </header>
      <div className="dash-card-body">{children}</div>
    </section>
  );
}
