import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  FileUp,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import AppLogo from '../components/AppLogo';

const STEPS = [
  { number: '01', title: 'Export from Revolut', copy: 'Use the CSV export you already control.', icon: WalletCards },
  { number: '02', title: 'Import locally', copy: 'Parsing happens inside your SimpleSafeBanking workspace.', icon: FileUp },
  { number: '03', title: 'See what matters', copy: 'Review activity, plans, vendors, and spending patterns.', icon: ChartNoAxesCombined },
];

export default function LandingPage() {
  return (
    <div className="new-landing-shell">
      <header className="new-landing-header">
        <Link to="/" className="new-landing-brand" aria-label="SimpleSafeBanking home">
          <span><AppLogo size={21} /></span>
          <strong>SimpleSafeBanking</strong>
        </Link>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
          <Link className="landing-nav-cta" to="/app/import">Import CSV</Link>
        </nav>
      </header>

      <main>
        <section className="new-landing-hero">
          <div className="new-landing-copy">
            <div className="landing-kicker"><ShieldCheck size={15} /> Private by default. Useful immediately.</div>
            <h1>Know where your money goes. Keep the history yours.</h1>
            <p>Turn Revolut CSV exports into a clear personal finance workspace, without linking a bank account or handing your records to a public SaaS.</p>
            <div className="new-landing-actions">
              <Link className="btn btn-primary landing-primary-action" to="/app/import">
                Import your CSV <ArrowRight size={17} />
              </Link>
              <Link className="btn" to="/app/import">Try synthetic demo data</Link>
            </div>
            <div className="landing-trust-row">
              <span><Check size={14} /> No account required</span>
              <span><Check size={14} /> Local-first storage</span>
              <span><Check size={14} /> Your backups</span>
            </div>
          </div>

          <div className="product-preview" aria-label="SimpleSafeBanking product preview">
            <div className="preview-topline"><span /><span /><span /></div>
            <div className="preview-body">
              <div className="preview-sidebar">
                <span className="active" /><span /><span /><span /><span />
              </div>
              <div className="preview-content">
                <div className="preview-heading"><span /><i /></div>
                <div className="preview-kpis">
                  <article><small>Net balance</small><strong>8,420 RON</strong><em>+12.4%</em></article>
                  <article><small>Monthly spend</small><strong>3,180 RON</strong><em>On track</em></article>
                  <article><small>Savings rate</small><strong>24.6%</strong><em>Healthy</em></article>
                </div>
                <div className="preview-chart">
                  <div className="preview-chart-title"><span /><i /></div>
                  <svg viewBox="0 0 500 170" role="img" aria-label="Illustrative savings trend">
                    <defs>
                      <linearGradient id="previewArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#247a55" stopOpacity=".28" />
                        <stop offset="1" stopColor="#247a55" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M5 145 C70 130 95 126 140 110 S230 120 275 78 S370 88 495 24 L495 170 L5 170 Z" fill="url(#previewArea)" />
                    <path d="M5 145 C70 130 95 126 140 110 S230 120 275 78 S370 88 495 24" fill="none" stroke="#247a55" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="preview-private-note"><LockKeyhole size={15} /> Stored in your browser by default</div>
          </div>
        </section>

        <section className="landing-proof-band">
          <span>Built for Revolut CSV</span>
          <strong>Personal</strong><strong>Business</strong><strong>Expenses</strong><strong>Normalized data</strong>
        </section>

        <section className="landing-how" id="how-it-works">
          <div className="landing-section-heading">
            <span>From export to insight</span>
            <h2>A useful dashboard in three quiet steps.</h2>
            <p>No connection ceremony, no mystery sync, and no setup maze.</p>
          </div>
          <div className="landing-step-grid">
            {STEPS.map(({ number, title, copy, icon: Icon }) => (
              <article key={number}>
                <div><span>{number}</span><Icon size={19} /></div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-privacy" id="privacy">
          <div className="privacy-illustration"><Sparkles size={26} /><LockKeyhole size={34} /></div>
          <div>
            <span className="eyebrow">A simpler trust model</span>
            <h2>Your finance tool should not need to become your bank.</h2>
            <p>SimpleSafeBanking works from files you export. Browser-local mode needs no public backend, and optional private sync is designed for self-hosted deployments you control.</p>
            <Link to="/app/import">Open the private workspace <ArrowRight size={15} /></Link>
          </div>
        </section>

        <section className="landing-final-cta">
          <AppLogo size={26} />
          <h2>Clarity without surrendering control.</h2>
          <p>Start with your CSV or explore safely with synthetic data.</p>
          <Link className="btn btn-primary" to="/app/import">Open SimpleSafeBanking <ArrowRight size={17} /></Link>
        </section>
      </main>
    </div>
  );
}
