import { useState, useMemo } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency, getColorForCategory } from '../lib/utils';
import { txKey } from '../lib/csvParser';

export default function Transactions() {
  const { data } = useAppContext();
  const [search, setSearch] = useState('');
  const displayCurrency = data.displayCurrency;
  
  const txns = data.transactions;

  const filtered = useMemo(() => {
    return txns.filter(t => t.desc.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100);
  }, [txns, search]);

  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Transactions</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#128196;</div>
          <div className="empty-state-title">No transactions</div>
          <div className="empty-state-desc">Upload a CSV to see your transactions here.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Transactions</h2>
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          className="input" 
          placeholder="Search descriptions..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '300px' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--muted)', alignSelf: 'center' }}>Showing up to 100 results</span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Source Currency</th><th style={{textAlign:'right'}}>Amount</th><th>Flow</th></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={txKey(t)}>
                  <td style={{ color: 'var(--muted)' }}>{t.date}</td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.desc}>{t.desc}</td>
                  <td><span style={{ color: getColorForCategory(t.cat), fontWeight: 600, fontSize: '11px' }}>{t.cat}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{t.currency || 'N/A'}</td>
                  <td style={{ textAlign: 'right', color: t.flow === 'Credit' ? 'var(--green)' : 'var(--red)' }}>
                    {t.flow === 'Credit' ? '+' : '-'}{formatCurrency(Math.abs(t.amt), displayCurrency)}
                  </td>
                  <td><span className={`badge ${t.flow}`}>{t.flow}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
