/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { runtimeConfig } from '../lib/runtimeConfig';
import { setLocalUserToken, userRequest } from '../lib/localUserSession';
import './LocalUsers.css';

const UserContext = createContext(null);
export const useLocalUser = () => useContext(UserContext);

function UserLogin({ onUnlock }) {
  const [directory, setDirectory] = useState(null);
  const [mode, setMode] = useState('unlock');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      const result = await userRequest('');
      setDirectory(result);
      setUserId(result.users[0]?.id || '');
      if (result.setupRequired) setMode('create');
      setError('');
    } catch {
      setError('Cannot reach local user storage. Start SSB and retry.');
    }
  }
  useEffect(() => {
    let cancelled = false;
    userRequest('')
      .then(async (result) => {
        if (cancelled) return;
        setDirectory(result);
        setUserId(result.users[0]?.id || '');
        if (result.setupRequired) setMode('create');
        const auto = runtimeConfig.devAutoLogin;
        const target =
          auto && !result.setupRequired && !result.migrationRequired
            ? result.users.find((user) => user.name === auto.name)
            : null;
        if (!target) return;
        try {
          const unlocked = await userRequest('/unlock', {
            userId: target.id,
            password: auto.password,
          });
          if (cancelled) return;
          setLocalUserToken(unlocked.token);
          onUnlock(unlocked);
        } catch {
          /* Fall back to the normal unlock form. */
        }
      })
      .catch(() => {
        if (!cancelled) setError('Cannot reach local user storage. Start SSB and retry.');
      });
    return () => {
      cancelled = true;
    };
  }, [onUnlock]);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (mode === 'create' && password !== confirm) {
      setError('Both passwords must match exactly.');
      return;
    }
    setBusy(true);
    try {
      const result = await userRequest(
        mode === 'unlock' ? '/unlock' : mode === 'restore' ? '/restore' : '',
        mode === 'unlock'
          ? { userId, password }
          : mode === 'restore'
            ? { name, password, bundle }
            : { name, password, migrate: directory.setupRequired },
      );
      setPassword('');
      setConfirm('');
      setLocalUserToken(result.token);
      onUnlock(result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="local-user-screen">
      <section className="local-user-card">
        <p className="section-note">SimpleSafeBanking · This computer</p>
        <h1>
          {directory?.setupRequired
            ? 'Create your first user'
            : mode === 'create'
              ? 'Create a user'
              : mode === 'restore'
                ? 'Restore a user'
                : 'Unlock your finances'}
        </h1>
        <p>
          {directory?.migrationRequired
            ? 'Your existing finances will be copied into this user’s encrypted database. A verified backup and the original workspace are preserved.'
            : 'Each user has a separate encrypted workspace. Unlock yours to continue.'}
        </p>
        {directory?.testingPasswords && (
          <p className="section-note">Testing mode: short passwords (4+ characters) are allowed.</p>
        )}
        {!directory ? (
          <button className="btn" onClick={load}>
            Retry connection
          </button>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {mode === 'unlock' ? (
                <label>
                  User
                  <select
                    className="input"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                  >
                    {directory.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  User name
                  <input
                    className="input"
                    autoComplete="username"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {mode === 'restore' && (
                <label>
                  Recovery file
                  <input
                    type="file"
                    accept=".ssbuser,application/json"
                    required
                    onChange={async (event) => {
                      setBundle(null);
                      const file = event.target.files?.[0];
                      try {
                        if (!file || file.size > 30 * 1024 * 1024) throw new Error();
                        setBundle(JSON.parse(await file.text()));
                      } catch {
                        setError('Choose a valid SSB user recovery file under 30 MB.');
                      }
                    }}
                  />
                </label>
              )}
              <label>
                {mode === 'restore' ? 'Password used when this recovery copy was made' : 'Password'}
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'create' ? directory.passwordMinimum || 16 : 4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {mode === 'create' && (
                <>
                  <label>
                    Repeat password
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={directory.passwordMinimum || 16}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </label>
                  <p className="section-note">
                    Use at least {directory.passwordMinimum || 16} characters (up to 256 UTF-8
                    bytes). Save it in your password manager. SSB cannot reset a forgotten password.
                  </p>
                </>
              )}
              {mode === 'restore' && (
                <p>A new profile will be created. Existing users will not be overwritten.</p>
              )}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={mode === 'restore' && !bundle}
              >
                {busy
                  ? 'Opening encrypted workspace…'
                  : mode === 'unlock'
                    ? 'Unlock'
                    : mode === 'restore'
                      ? 'Restore as new user'
                      : directory.migrationRequired
                        ? 'Preserve my finances & create user'
                        : 'Create empty user'}
              </button>
            </fieldset>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {directory && !directory.migrationRequired && (
          <nav aria-label="User actions">
            {[
              ['unlock', 'Choose user'],
              ['create', 'Create user'],
              ['restore', 'Restore recovery copy'],
            ]
              .filter(([value]) => value !== mode && (value !== 'unlock' || directory.users.length))
              .map(([value, label]) => (
                <button
                  className="btn"
                  key={value}
                  disabled={busy}
                  onClick={() => {
                    setMode(value);
                    setPassword('');
                    setConfirm('');
                    setError('');
                  }}
                >
                  {label}
                </button>
              ))}
          </nav>
        )}
        <p className="section-note">
          Local users separate finances inside SSB. They do not protect an unlocked session from
          someone controlling this Mac.
        </p>
      </section>
    </main>
  );
}

export default function LocalUsersGate({ children }) {
  const [session, setSession] = useState(null);
  if (!runtimeConfig.localUsers) return children;
  if (!session) return <UserLogin onUnlock={setSession} />;
  return (
    <UserContext.Provider value={session}>
      <div className="local-user-app">{children}</div>
    </UserContext.Provider>
  );
}
