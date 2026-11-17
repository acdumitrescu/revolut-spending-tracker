import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { useLocalUser } from './LocalUsersGate';
import { setLocalUserToken, userRequest } from '../lib/localUserSession';
import { runtimeConfig } from '../lib/runtimeConfig';

export default function LocalUserControls() {
  const session = useLocalUser();
  const { flushPendingChanges, resumeUserSession } = useAppContext();
  const [cover, setCover] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const busy = useRef(false);
  const [startedAt] = useState(() => Date.now());
  const lastActivity = useRef(startedAt);
  const finishLock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setCover(true);
    setMessage('Saving changes and locking…');
    try {
      await flushPendingChanges();
      await userRequest('/lock', {});
      setLocalUserToken('');
      // A full document replacement also drops charts, route state and caches.
      window.location.replace('/app');
    } catch {
      setMessage(
        'Could not save and lock. Your edits are still in this window. Retry, or unlock this window again to resolve the save problem.',
      );
    } finally {
      busy.current = false;
    }
  }, [flushPendingChanges]);
  useEffect(() => {
    if (!session) return undefined;
    const activity = () => {
      lastActivity.current = Date.now();
    };
    const expired = () => {
      setCover(true);
      setMessage(
        'The server session expired. Unsaved edits, if any, are still in this window. Unlock this window again to continue.',
      );
    };
    const check = () => {
      if (
        !session.autoLockDisabled &&
        !cover &&
        Date.now() - lastActivity.current >= session.idleMs - 60000
      )
        void finishLock();
    };
    for (const event of ['pointerdown', 'keydown', 'scroll'])
      window.addEventListener(event, activity, { passive: true });
    window.addEventListener('ssb-user-expired', expired);
    const interval = session.autoLockDisabled ? null : setInterval(check, 10000);
    // Only actual user activity keeps the server session alive.
    const heartbeat = setInterval(() => {
      if (Date.now() - lastActivity.current < 60000 && !busy.current)
        void userRequest('/session').catch(expired);
    }, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(heartbeat);
      for (const event of ['pointerdown', 'keydown', 'scroll'])
        window.removeEventListener(event, activity);
      window.removeEventListener('ssb-user-expired', expired);
    };
  }, [session, finishLock, cover]);
  useEffect(() => {
    if (!session) return undefined;
    const hide = () => {
      const workspace = document.getElementById('user-workspace');
      if (workspace) {
        workspace.inert = true;
        workspace.style.visibility = 'hidden';
      }
      void userRequest('/lock', {}, { keepalive: true }).catch(() => {});
      setLocalUserToken('');
    };
    const show = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [session]);
  useEffect(() => {
    if (!session) return undefined;
    const workspace = document.getElementById('user-workspace');
    if (workspace) {
      workspace.inert = cover;
      workspace.style.visibility = cover ? 'hidden' : '';
    }
    return () => {
      if (workspace) {
        workspace.inert = false;
        workspace.style.visibility = '';
      }
    };
  }, [cover, session]);
  useEffect(() => {
    const auto = runtimeConfig.devAutoLogin;
    if (!session || !cover || !auto || busy.current) return;
    busy.current = true;
    (async () => {
      try {
        const unlocked = await userRequest('/unlock', {
          userId: session.user.id,
          password: auto.password,
        });
        setLocalUserToken(unlocked.token);
        const notice = await resumeUserSession();
        lastActivity.current = Date.now();
        setCover(false);
        setMessage(notice);
      } catch (error) {
        setMessage(error.message);
      } finally {
        busy.current = false;
      }
    })();
  }, [cover, session, resumeUserSession]);
  if (!session) return null;
  const resume = async (event) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    try {
      const unlocked = await userRequest('/unlock', { userId: session.user.id, password });
      setLocalUserToken(unlocked.token);
      const notice = await resumeUserSession();
      setPassword('');
      lastActivity.current = Date.now();
      setCover(false);
      setMessage(notice);
    } catch (error) {
      setMessage(error.message);
    } finally {
      busy.current = false;
    }
  };
  const recovery = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await flushPendingChanges();
      const bundle = await userRequest('/recovery', {});
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `ssb-user-recovery-${new Date().toISOString().slice(0, 10)}.ssbuser`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        'Encrypted recovery copy downloaded. Keep it off this Mac and retain this user’s password in your password manager.',
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      busy.current = false;
    }
  };
  return (
    <>
      <aside className="local-user-bar" aria-label="Current user">
        <strong>{session.user.name}</strong>
        <span>Local encrypted user</span>
        <button className="btn" onClick={recovery}>
          Download recovery copy
        </button>
        <button className="btn" onClick={finishLock}>
          Lock / Switch user
        </button>
        {message && !cover && <p role="status">{message}</p>}
      </aside>
      {cover && (
        <div
          className="local-user-screen local-user-cover"
          role="dialog"
          aria-modal="true"
          aria-label="Lock user"
        >
          <section className="local-user-card">
            <h1>Workspace hidden</h1>
            <p role="status">{message}</p>
            <button className="btn" onClick={finishLock}>
              Retry save & lock
            </button>
            <form onSubmit={resume}>
              <label>
                Password for {session.user.name}
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="btn" type="submit">
                Unlock this window
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
