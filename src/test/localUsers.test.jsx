import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const { request, setToken, flush, resume } = vi.hoisted(() => ({
  request: vi.fn(),
  setToken: vi.fn(),
  flush: vi.fn(),
  resume: vi.fn(),
}));
vi.mock('../lib/runtimeConfig', () => ({ runtimeConfig: { localUsers: true } }));
vi.mock('../lib/localUserSession', () => ({ userRequest: request, setLocalUserToken: setToken }));
vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({ flushPendingChanges: flush, resumeUserSession: resume }),
}));
import LocalUsersGate from '../components/LocalUsersGate';
import LocalUserControls from '../components/LocalUserControls';
const password = 'synthetic test password';
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it('does not idle-lock a development session but retains manual locking', async () => {
  request
    .mockResolvedValueOnce({ users: [{ id: 'one', name: 'First' }], setupRequired: false })
    .mockResolvedValueOnce({
      user: { id: 'one', name: 'First' },
      token: 'test-session',
      idleMs: 900000,
      autoLockDisabled: true,
    });
  render(
    <LocalUsersGate>
      <LocalUserControls />
      <div id="user-workspace">Private finances</div>
    </LocalUsersGate>,
  );
  await screen.findByLabelText('Password');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Unlock' }).closest('form'));
  });
  request.mockResolvedValue({});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(13 * 60 * 60 * 1000);
  });
  expect(flush).not.toHaveBeenCalled();
  expect(screen.getByText('Private finances')).toBeVisible();
  flush.mockRejectedValueOnce(new Error('Synthetic save failure'));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lock / Switch user' }));
  });
  expect(flush).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Private finances')).not.toBeVisible();
});

it('never mounts finances before unlock, validates password repetition and preserves the first workspace', async () => {
  request.mockResolvedValueOnce({ users: [], setupRequired: true, migrationRequired: true });
  render(
    <LocalUsersGate>
      <p>Private finances</p>
    </LocalUsersGate>,
  );
  expect(screen.queryByText('Private finances')).not.toBeInTheDocument();
  await screen.findByLabelText('User name');
  fireEvent.change(screen.getByLabelText('User name'), { target: { value: 'First' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Repeat password'), {
    target: { value: 'different password' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Preserve my finances & create user' }).closest('form'),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('match exactly');
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce({
    user: { id: 'one', name: 'First' },
    token: 'test-session',
    idleMs: 900000,
  });
  fireEvent.change(screen.getByLabelText('Repeat password'), { target: { value: password } });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Preserve my finances & create user' }).closest('form'),
  );
  await screen.findByText('Private finances');
  expect(request).toHaveBeenLastCalledWith('', { name: 'First', password, migrate: true });
  expect(setToken).toHaveBeenCalledWith('test-session');
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
});

it('keeps finances hidden after a failed unlock', async () => {
  request
    .mockResolvedValueOnce({ users: [{ id: 'one', name: 'First' }], setupRequired: false })
    .mockRejectedValueOnce(new Error('Wrong password'));
  render(
    <LocalUsersGate>
      <p>Private finances</p>
    </LocalUsersGate>,
  );
  await screen.findByLabelText('Password');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: 'Unlock' }).closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password');
  expect(screen.queryByText('Private finances')).not.toBeInTheDocument();
});

it('covers financial content before flushing and requires reauthentication to resume after save failure', async () => {
  request
    .mockResolvedValueOnce({ users: [{ id: 'one', name: 'First' }], setupRequired: false })
    .mockResolvedValueOnce({
      user: { id: 'one', name: 'First' },
      token: 'test-session',
      idleMs: 900000,
    });
  flush.mockRejectedValueOnce(new Error('Network failure'));
  render(
    <LocalUsersGate>
      <LocalUserControls />
      <div id="user-workspace">Private finances</div>
    </LocalUsersGate>,
  );
  await screen.findByLabelText('Password');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: 'Unlock' }).closest('form'));
  fireEvent.click(await screen.findByRole('button', { name: 'Lock / Switch user' }));
  await waitFor(() => expect(screen.getByText('Private finances')).not.toBeVisible());
  expect(flush).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalledWith('/lock', {});
  expect(screen.queryByRole('button', { name: 'Return to workspace' })).not.toBeInTheDocument();
  request.mockResolvedValueOnce({ token: 'new-test-session' });
  resume.mockResolvedValueOnce('');
  fireEvent.change(screen.getByLabelText('Password for First'), { target: { value: password } });
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Unlock this window' }).closest('form'));
  });
  expect(request).toHaveBeenLastCalledWith('/unlock', { userId: 'one', password });
  expect(resume).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Private finances')).toBeVisible();
});
