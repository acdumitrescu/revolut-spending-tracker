import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatShortDate, PhoneStorageFullError } from '../lib/phoneCopy';
import {
  inspectSnapshotHeader,
  readSnapshot,
  SnapshotError,
  summarizeAppState,
} from '../lib/snapshotFile';
import { useToast } from './Toast';
import './PhoneSync.css';

// iOS decides which files a picker offers from the accept list. ".ssbsnap" is an unknown
// extension there, so "application/octet-stream" is listed as well to keep the file selectable.
export const SNAPSHOT_ACCEPT = '.ssbsnap,application/octet-stream';

async function readFileBytes(file) {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function dateOrDash(isoDate) {
  return isoDate || '—';
}

function timestampText(value) {
  return Number.isFinite(value) ? formatShortDate(value) : '—';
}

function describeError(error) {
  if (error instanceof PhoneStorageFullError || error instanceof SnapshotError)
    return error.message;
  return error?.message || 'Something went wrong. Nothing was replaced.';
}

/**
 * Phone side of the sync: pick the .ssbsnap file, type the password, compare, confirm. The
 * replace itself (all-or-nothing, with the phone-copy record) is AppContext.replaceWorkspaceFromSnapshot.
 */
export default function ReceiveFromMac({ id = 'receive-from-mac' }) {
  const { persistedState, phoneCopy, replaceWorkspaceFromSnapshot } = useAppContext();
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  // step: 'idle' (nothing chosen) -> 'password' (header ok) -> 'preview' (opened)
  const [step, setStep] = useState('idle');
  const [file, setFile] = useState(null); // { name, bytes }
  const [password, setPassword] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('idle');
    setFile(null);
    setPassword('');
    setSnapshot(null);
    setError('');
    setBusy(false);
  };

  const handleFile = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    reset();
    try {
      const bytes = await readFileBytes(chosen);
      inspectSnapshotHeader(bytes);
      setFile({ name: chosen.name, bytes });
      setStep('password');
    } catch (caught) {
      setError(
        caught instanceof SnapshotError
          ? caught.message
          : 'This file could not be read. Pick the .ssbsnap file from Files.',
      );
    }
  };

  const openFile = async (event) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      setSnapshot(await readSnapshot(file.bytes, password));
      setPassword('');
      setStep('preview');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const replace = () => {
    if (!snapshot || busy) return;
    setBusy(true);
    setError('');
    try {
      replaceWorkspaceFromSnapshot(snapshot.appState.data, {
        fileCreatedAt: Date.parse(snapshot.meta.createdAt),
        source: snapshot.meta.source,
      });
      toast.success('Replaced. This phone now shows the copy from the Mac.');
      reset();
      navigate('/app');
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  };

  const now = summarizeAppState(persistedState);
  const fileSummary = snapshot?.meta.summary;
  const fileCreatedMs = snapshot ? Date.parse(snapshot.meta.createdAt) : NaN;
  const isOlder =
    Boolean(phoneCopy) &&
    Number.isFinite(phoneCopy.fileCreatedAt) &&
    Number.isFinite(fileCreatedMs) &&
    fileCreatedMs < phoneCopy.fileCreatedAt;

  return (
    <div className="card phone-sync-card" id={id} aria-label="Receive from Mac">
      <h2>
        <Smartphone size={18} aria-hidden="true" /> Receive from Mac
      </h2>
      <p className="section-note">
        On the Mac, use Send to iPhone and AirDrop the file here. Then pick it below. The phone
        keeps a read-only copy that works offline.
      </p>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={SNAPSHOT_ACCEPT}
        aria-label="Choose snapshot file from the Mac"
        onChange={handleFile}
      />
      {step === 'idle' && (
        <div className="phone-sync-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            Choose file from Mac
          </button>
        </div>
      )}

      {step === 'password' && file && (
        <form className="phone-sync-card" onSubmit={openFile}>
          <p>
            File: <strong>{file.name}</strong>
          </p>
          <label className="field-stack">
            <span>Password from the Mac</span>
            <input
              className="input"
              type="password"
              value={password}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="phone-sync-row">
            <button className="btn" type="button" onClick={reset}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || !password}>
              {busy ? 'Opening…' : 'Open file'}
            </button>
          </div>
        </form>
      )}

      {step === 'preview' && snapshot && (
        <div className="phone-sync-card" aria-label="What will change">
          <h3>What will change</h3>
          {isOlder && (
            <p className="phone-sync-warning" role="alert">
              This file is older than the copy already on this phone (made{' '}
              {timestampText(phoneCopy.fileCreatedAt)}; this file was made{' '}
              {timestampText(fileCreatedMs)}). Replacing it takes the phone back in time.
            </p>
          )}
          <table className="phone-sync-compare">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Now on this phone</th>
                <th scope="col">From the file</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Created</th>
                <td>{timestampText(phoneCopy?.fileCreatedAt)}</td>
                <td>{timestampText(fileCreatedMs)}</td>
              </tr>
              <tr>
                <th scope="row">Source</th>
                <td>{phoneCopy?.source || '—'}</td>
                <td>{snapshot.meta.source || '—'}</td>
              </tr>
              <tr>
                <th scope="row">Transactions</th>
                <td>{now.transactions}</td>
                <td>{fileSummary.transactions}</td>
              </tr>
              <tr>
                <th scope="row">First transaction</th>
                <td>{dateOrDash(now.firstTransactionDate)}</td>
                <td>{dateOrDash(fileSummary.firstTransactionDate)}</td>
              </tr>
              <tr>
                <th scope="row">Last transaction</th>
                <td>{dateOrDash(now.lastTransactionDate)}</td>
                <td>{dateOrDash(fileSummary.lastTransactionDate)}</td>
              </tr>
              <tr>
                <th scope="row">Accounts</th>
                <td>{now.accounts}</td>
                <td>{fileSummary.accounts}</td>
              </tr>
            </tbody>
          </table>
          <p className="section-note">
            This replaces everything on this phone. Nothing is merged. If anything goes wrong, what
            is on the phone now stays as it is.
          </p>
          <div className="phone-sync-row">
            <button className="btn" type="button" disabled={busy} onClick={reset}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={replace}>
              Replace phone copy
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="phone-sync-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
