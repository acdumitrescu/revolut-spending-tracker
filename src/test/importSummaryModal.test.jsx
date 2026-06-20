import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImportSummaryModal from '../components/ImportSummaryModal';

describe('ImportSummaryModal', () => {
  it('renders detected profile, warnings, and skip reasons', () => {
    render(
      <ImportSummaryModal
        fileName="sample.csv"
        onClose={vi.fn()}
        summary={{
          detectedProfileLabel: 'Revolut Personal CSV',
          processedRows: 12,
          skippedRows: 2,
          totalRows: 14,
          warnings: ['Partially recognized header set detected.'],
          skippedReasonCounts: { 'invalid amount': 1, 'missing description': 1 },
          skippedDetails: ['Row 4: invalid amount', 'Row 6: missing description'],
        }}
      />
    );

    expect(screen.getByText('Import Summary')).toBeInTheDocument();
    expect(screen.getByText('Revolut Personal CSV')).toBeInTheDocument();
    expect(screen.getByText('Partially recognized header set detected.')).toBeInTheDocument();
    expect(screen.getByText('invalid amount (1)')).toBeInTheDocument();
    expect(screen.getByText('Row 4: invalid amount')).toBeInTheDocument();
    expect(screen.getByText(/parsed locally in your browser/i)).toBeInTheDocument();
  });
});
