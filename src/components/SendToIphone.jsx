import { useState } from 'react';
import { Copy, RefreshCw, Smartphone } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { createSnapshot, generatePassphrase } from '../lib/snapshotFile';
import { downloadBinaryFile, snapshotFilename } from '../lib/workspaceExports';
import { useToast } from './Toast';
import './PhoneSync.css';

/**
 * Mac side of the phone sync: writes the whole workspace into one password-protected .ssbsnap
 * file through the same save mechanism as the JSON backup. The password lives only in this
 * component's state: it is never handed to the app context or to storage.
 */
export default function SendToIphone({ kdfIterations }) {
  const { persistedState } = useAppContext();
  const toast = useToast();
  const [password, setPassword] = useState(() => generatePassphrase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedAs, setSavedAs] = useState('');

  const createFile = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSavedAs('');
    try {
      const now = new Date();
      const bytes = await createSnapshot({
        appState: persistedState,
        password,
        now,
        source: 'Mac',
        ...(kdfIterations ? { iterations: kdfIterations } : {}),
      });
      const filename = snapshotFilename(now);
      downloadBinaryFile(bytes, filename);
      setSavedAs(filename);
    } catch (caught) {
      setError(
        caught?.name === 'SnapshotError'
          ? caught.message
          : 'The sync file could not be created. Nothing was saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Password copied.');
    } catch {
      toast.warning('Could not copy. Select the password and copy it by hand.');
    }
  };

  return (
    <div className="card phone-sync-card" aria-label="Send to iPhone">
      <h2>
        <Smartphone size={18} aria-hidden="true" /> Send to iPhone
      </h2>
      <p className="section-note">
        Make one password-protected file with your whole workspace. You will type this password on
        the iPhone. It is not stored anywhere.
      </p>
      <label className="field-stack">
        <span>Password for the iPhone</span>
        <span className="phone-sync-row">
          <input
            className="input"
            type="text"
            value={password}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="off"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="btn"
            type="button"
            onClick={() => {
              setPassword(generatePassphrase());
              setSavedAs('');
            }}
          >
            <RefreshCw size={15} aria-hidden="true" /> New password
          </button>
          <button className="btn" type="button" onClick={copyPassword}>
            <Copy size={15} aria-hidden="true" /> Copy password
          </button>
        </span>
      </label>
      <div className="phone-sync-row">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={createFile}>
          {busy ? 'Creating…' : 'Create sync file'}
        </button>
      </div>
      {error && (
        <p className="phone-sync-error" role="alert">
          {error}
        </p>
      )}
      {savedAs && (
        <p className="phone-sync-success" role="status">
          Saved. AirDrop it to your iPhone, then open SSB there and tap Receive from Mac.
          <br />
          <small>
            {savedAs} · password: {password}
          </small>
        </p>
      )}
    </div>
  );
}
