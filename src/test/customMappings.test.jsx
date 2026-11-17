import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CustomMappings from '../components/CustomMappings';

const vendors = {
  STARBUCKS: ['Food & Dining', 'Coffee'],
  NETFLIX: ['Subscriptions', ''],
  ALDI: ['Food & Dining', 'Groceries'],
};

describe('CustomMappings', () => {
  it('lists mappings sorted by category, then vendor, and filters by search', () => {
    render(<CustomMappings customVendors={vendors} onSave={vi.fn()} onRemove={vi.fn()} />);
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['ALDI', 'STARBUCKS', 'NETFLIX']);
    fireEvent.change(screen.getByLabelText('Search mappings'), { target: { value: 'coffee' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search mappings'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search mappings'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No mappings match/)).toBeInTheDocument();
  });

  it('adds, edits and removes a mapping', () => {
    const onSave = vi.fn();
    const onRemove = vi.fn();
    render(<CustomMappings customVendors={vendors} onSave={onSave} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: /add mapping/i }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Vendor name'), { target: { value: '  LIDL ' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Food & Dining' } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith('LIDL', 'Food & Dining', '');

    fireEvent.click(screen.getByRole('button', { name: 'Edit mapping for NETFLIX' }));
    fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: 'Streaming' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping for NETFLIX' }));
    expect(onSave).toHaveBeenLastCalledWith('NETFLIX', 'Subscriptions', 'Streaming');

    fireEvent.click(screen.getByRole('button', { name: 'Delete mapping for ALDI' }));
    expect(onRemove).toHaveBeenCalledWith('ALDI');
  });

  it('opens the add form prefilled when the page requests it', () => {
    render(
      <CustomMappings
        customVendors={{}}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        request={{ mode: 'add', vendor: 'ACME' }}
      />,
    );
    expect(screen.getByLabelText('Vendor name')).toHaveValue('ACME');
  });
});
