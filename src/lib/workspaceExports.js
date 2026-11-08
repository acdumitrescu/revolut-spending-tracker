import { BASE_CURRENCY } from './fx';
import { serializeBackupState } from './persistence';
import { getCreditOverview } from './credit';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadTextFile(contents, filename, mimeType = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([contents], { type: mimeType }), filename);
}

function datedFilename(extension) {
  return `simple_safe_banking_backup_${new Date().toISOString().split('T')[0]}.${extension}`;
}

export function exportJsonBackup(persistedState) {
  downloadBlob(
    new Blob([serializeBackupState(persistedState)], { type: 'application/json' }),
    datedFilename('json')
  );
}

export async function exportExcelWorkbook(data) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SimpleSafeBanking';
  workbook.created = new Date();

  const transactionSheet = workbook.addWorksheet('Transactions');
  transactionSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Description', key: 'desc', width: 28 },
    { header: 'Category', key: 'cat', width: 18 },
    { header: 'Subcategory', key: 'sub', width: 18 },
    { header: 'Amount', key: 'amt', width: 12 },
    { header: 'Flow', key: 'flow', width: 12 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'YearMonth', key: 'ym', width: 12 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Reference', key: 'ref', width: 20 },
    { header: 'Source', key: 'source', width: 12 },
    { header: 'MatchedVendor', key: 'matchedVendor', width: 20 },
    { header: 'MatchedAlias', key: 'matchedAlias', width: 20 },
    { header: 'MatchSource', key: 'matchSource', width: 18 },
    { header: 'MatchStrategy', key: 'matchStrategy', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 14 },
  ];
  data.transactions.forEach((transaction) => transactionSheet.addRow(transaction));

  const accountsSheet = workbook.addWorksheet('Accounts');
  const accountMonths = [...new Set(data.accounts.flatMap((account) => Object.keys(account.balances)))].sort();
  accountsSheet.columns = [
    { header: 'Account', key: 'name', width: 24 },
    { header: 'Group', key: 'group', width: 18 },
    { header: 'Currency', key: 'currency', width: 12 },
    ...accountMonths.map((month) => ({ header: month, key: month, width: 14 })),
  ];
  data.accounts.forEach((account) => accountsSheet.addRow({
    name: account.name,
    group: account.group,
    currency: account.currency || BASE_CURRENCY,
    ...account.balances,
  }));

  const accountNotesSheet = workbook.addWorksheet('Account Notes');
  accountNotesSheet.columns = [
    { header: 'Account', key: 'account', width: 24 },
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Note', key: 'note', width: 48 },
  ];
  data.accounts.forEach((account) => {
    Object.entries(account.notes || {}).forEach(([month, note]) => {
      accountNotesSheet.addRow({ account: account.name, month, note });
    });
  });

  const creditSheet = workbook.addWorksheet('Credit and Plans');
  creditSheet.columns = [
    { header: 'Type', key: 'kind', width: 16 },
    { header: 'Creditor / Plan', key: 'name', width: 28 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Still Owed (Actual)', key: 'remainingBalance', width: 22 },
    { header: 'Amount to Finance (Plan)', key: 'amountFinanced', width: 26 },
    { header: 'Monthly Payment (Entered)', key: 'monthlyPayment', width: 28 },
    { header: 'Next Payment / Planned Start', key: 'dueDate', width: 30 },
    { header: 'Plan Term (Months)', key: 'termMonths', width: 20 },
    { header: 'Account Balance Month', key: 'latestMonth', width: 24 },
    { header: 'Notes', key: 'notes', width: 48 },
  ];
  const credit = getCreditOverview(data);
  [...credit.cards, ...credit.vendors, ...credit.plans].forEach((record) => creditSheet.addRow(record));
  const purchasesSheet = workbook.addWorksheet('Card Purchases');
  purchasesSheet.columns = [
    ['Account', 'account'], ['Currency', 'currency'], ['Purchase', 'name'], ['Status', 'status'],
    ['Original Price', 'initialCost'], ['Total Repayment', 'totalCost'], ['Still Owed', 'remainingBalance'],
    ['Per Instalment', 'instalmentAmount'], ['Total Months', 'totalMonths'], ['Months Remaining', 'remainingMonths'],
    ['Archived At', 'archivedAt'], ['Notes', 'notes'],
  ].map(([header, key]) => ({ header, key, width: 24 }));
  credit.cards.forEach((card) => card.purchases.forEach((purchase) => purchasesSheet.addRow({
    ...purchase, account: card.name, currency: card.currency,
    archivedAt: purchase.archivedAt === null ? '' : new Date(purchase.archivedAt).toISOString(),
  })));

  const incomeSheet = workbook.addWorksheet('Income Receipts');
  incomeSheet.columns = [['Date','date'], ['Source','source'], ['Type','kind'], ['Amount','amount'], ['Currency','currency'], ['Received In','receivedIn'], ['Notes','notes']].map(([header,key]) => ({header,key,width:24}));
  (data.moneyFlow?.incomes || []).forEach(row => incomeSheet.addRow({...row, amount:row.amountMinor / 100, receivedIn:row.receivedIn.label}));
  const allocationSheet = workbook.addWorksheet('Income Allocations');
  allocationSheet.columns = [['Date','date'], ['Income Source','source'], ['From','from'], ['To','to'], ['Status','status'], ['Amount Sent','amount'], ['Sent Currency','currency'], ['Amount Arriving','received'], ['Arriving Currency','receivedCurrency'], ['Notes','notes']].map(([header,key]) => ({header,key,width:24}));
  (data.moneyFlow?.transfers || []).forEach(row => {
    const income = data.moneyFlow.incomes.find(item => item.id === row.incomeId);
    allocationSheet.addRow({...row, source:income?.source, from:income?.receivedIn.label, to:row.destination.label, amount:row.amountMinor / 100, currency:income?.currency, received:row.receivedMinor / 100, receivedCurrency:row.destination.currency});
  });

  const vendorSheet = workbook.addWorksheet('Custom Vendors');
  vendorSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 24 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Subcategory', key: 'subcategory', width: 18 },
  ];
  Object.entries(data.customVendors).forEach(([vendor, [category, subcategory]]) => {
    vendorSheet.addRow({ vendor, category, subcategory });
  });

  const settingsSheet = workbook.addWorksheet('Settings');
  settingsSheet.columns = [
    { header: 'Key', key: 'key', width: 20 },
    { header: 'Value', key: 'value', width: 26 },
  ];
  settingsSheet.addRows([
    { key: 'BaseCurrency', value: data.baseCurrency },
    { key: 'DisplayCurrency', value: data.displayCurrency },
    { key: 'RonPerEur', value: data.fxRates?.EUR },
    { key: 'RonPerUsd', value: data.fxRates?.USD },
    { key: 'FxUpdatedAt', value: data.fxUpdatedAt ? new Date(data.fxUpdatedAt).toISOString() : '' },
    { key: 'FxSource', value: data.fxSource || '' },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    datedFilename('xlsx')
  );
}
