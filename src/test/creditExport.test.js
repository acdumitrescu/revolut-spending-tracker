// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createInitialAppData } from '../lib/appState';
import { exportExcelWorkbook } from '../lib/workspaceExports';

describe('credit workbook export', () => {
  it('exports linked debt and future plans in separate amount columns', async () => {
    let downloaded;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloaded = blob;
      return 'blob:synthetic-export';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('document', {
      createElement: () => ({ click: vi.fn() }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    try {
      await exportExcelWorkbook({
        ...createInitialAppData(),
        accounts: [
          { id: 'c', name: 'ING CREDIT CARD', currency: 'RON', balances: { '2026-09': -100 } },
        ],
        creditRecords: [
          {
            id: 'p',
            kind: 'planned',
            name: 'Synthetic lease',
            currency: 'EUR',
            amountFinanced: 5000,
            monthlyPayment: 100,
            termMonths: 60,
            dueDate: '',
            notes: 'Quote pending',
          },
        ],
      });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await downloaded.arrayBuffer());
      const sheet = workbook.getWorksheet('Credit and Plans');
      expect(sheet.getCell('A2').value).toBe('card');
      expect(sheet.getCell('D2').value).toBe(100);
      expect(sheet.getCell('E2').value).toBeNull();
      expect(sheet.getCell('A3').value).toBe('planned');
      expect(sheet.getCell('D3').value).toBeNull();
      expect(sheet.getCell('E3').value).toBe(5000);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
