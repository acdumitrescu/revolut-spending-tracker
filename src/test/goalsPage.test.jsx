import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../lib/AppContext';
import { appReducer, createPersistedAppState } from '../lib/appState';
import Goals from '../pages/Goals';

vi.mock('../components/ChartWrapper', () => ({ default: () => <div>Projection chart</div> }));

const goal = (extra = {}) => ({ id: 'g1', name: 'Fund', targetAmount: 1000, ...extra });

describe('goal reducer', () => {
  it('rejects invalid goals, edits by id, reorders and manages contributions', () => {
    let state = createPersistedAppState();
    expect(appReducer(state, { type: 'add_goal', goal: { id: 'x', name: '', targetAmount: 5 } })).toBe(state);
    state = appReducer(state, { type: 'add_goal', goal: goal() });
    state = appReducer(state, { type: 'add_goal', goal: goal({ id: 'g2', name: 'Trip' }) });
    state = appReducer(state, { type: 'update_goal', goalId: 'g1', changes: { name: 'Emergency', currency: 'EUR', linkedAccountIds: ['a'] } });
    expect(state.data.goals[0]).toMatchObject({ id: 'g1', name: 'Emergency', currency: 'EUR', linkedAccountIds: ['a'], targetAmount: 1000 });
    expect(appReducer(state, { type: 'update_goal', goalId: 'g1', changes: { targetAmount: -4 } })).toBe(state);
    state = appReducer(state, { type: 'move_goal', goalId: 'g2', direction: -1 });
    expect(state.data.goals.map((item) => item.id)).toEqual(['g2', 'g1']);
    expect(appReducer(state, { type: 'move_goal', goalId: 'g2', direction: -1 })).toBe(state);
    state = appReducer(state, { type: 'add_goal_contribution', goalId: 'g1', contribution: { id: 'c1', date: '2026-10-01', amount: 40 } });
    expect(state.data.goals[1].contributions).toHaveLength(1);
    expect(appReducer(state, { type: 'add_goal_contribution', goalId: 'g1', contribution: { id: 'c2', date: 'bad', amount: 1 } })).toBe(state);
    state = appReducer(state, { type: 'remove_goal_contribution', goalId: 'g1', contributionId: 'c1' });
    expect(state.data.goals[1].contributions).toEqual([]);
    state = appReducer(state, { type: 'remove_goal', goalId: 'g2' });
    expect(state.data.goals.map((item) => item.id)).toEqual(['g1']);
  });
});

describe('goals page', () => {
  it('creates a goal, adds money by hand, edits it and deletes it only after confirming', () => {
    render(<AppProvider><Goals /></AppProvider>);
    expect(screen.getByText('No goals yet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /new goal/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the goal a name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Holiday' } });
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }));

    const card = screen.getByRole('article', { name: 'Holiday' });
    expect(within(card).getByText('0%')).toBeInTheDocument();
    expect(within(card).getByText('Not enough history')).toBeInTheDocument();

    fireEvent.click(within(card).getByText(/Money added by hand/));
    fireEvent.change(within(card).getByLabelText('Amount'), { target: { value: '250' } });
    fireEvent.click(within(card).getByRole('button', { name: /save/i }));
    expect(within(screen.getByRole('article', { name: 'Holiday' })).getByText('25%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Holiday' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Summer trip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('article', { name: 'Summer trip' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Summer trip' }));
    expect(screen.getByRole('article', { name: 'Summer trip' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }));
    expect(screen.getByText('No goals yet')).toBeInTheDocument();
  });
});
