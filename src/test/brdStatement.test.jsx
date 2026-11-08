import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { parseBrdStatement, prepareBrdImport, summarizeBrd, manualBrdRow, brdImportMatches } from '../lib/brdStatement';
import { createPersistedAppState } from '../lib/appState';
import { MoneyFlowSchema } from '../lib/validation';
import BrdCashflow from '../components/BrdCashflow';

const context = vi.hoisted(() => ({ value: {} }));
vi.mock('../lib/AppContext', () => ({ useAppContext: () => context.value }));
vi.mock('../components/ChartWrapper', () => ({ default: () => <div>BRD chart</div> }));
const header = 'Date of Transaction,Merchant/Beneficiary Name,Transaction details,Amount,Currency,Transaction type,Status';
const csv = [header,
  '2026-09-10,Synthetic employer,Transfer credit,1000.29,RON,CRDT,PROCESSED',
  '2026-09-11,Own savings,Plata instant,200,RON,DBIT,PROCESSED',
  '2026-09-12,Synthetic shop,POS,12.34,RON,DBIT,PROCESSED',
  '2026-09-12,Synthetic shop,POS,12.34,RON,DBIT,PROCESSED',
  '2026-09-13,,Retrageri de Numerar-ATM/MBA BRD,50,RON,DBIT,PROCESSED',
  '2026-09-14,Synthetic shop,POS,20,RON,DBIT,PENDING',
].join('\n');
const base = () => ({...createPersistedAppState().data, accounts:[{id:'brd',name:'BRD',currency:'RON',balances:{'2026-09':500},notes:{}},{id:'other',name:'Other',currency:'RON',balances:{'2026-09':100},notes:{}}]});
const request = async () => ({ statement: await parseBrdStatement(csv, ['Own savings']), accountId:'brd',fileName:'synthetic.csv',ownRecipients:['Own savings'], importedAt:1 });

describe('BRD-only statement ledger', () => {
  const manual = (overrides = {}) => manualBrdRow({date:'2026-09-12',category:'expense',amount:'12.34',beneficiary:'Synthetic shop',notes:'Keep this note',direction:'DBIT',...overrides});
  it('validates manual cents and classification and round-trips through portable state', () => {
    const rows = [manual(), manual({category:'refund'}), manual({category:'transfer',direction:'CRDT'}), manual({category:'income'}), manual({category:'cash-withdrawal'})];
    expect(rows[0].amountMinor).toBe(1234);
    expect(summarizeBrd(rows)).toMatchObject({income:1234,expense:1234,refund:1234,transfersIn:1234,cash:1234,net:1234});
    const data = base(); data.moneyFlow.brd = {accountId:'brd', rows, imports:[]};
    expect(createPersistedAppState(JSON.parse(JSON.stringify(data))).data.moneyFlow.brd.rows).toEqual(rows);
    for (const amount of ['-1','0','1.234','NaN']) expect(() => manual({amount})).toThrow();
    expect(() => manual({date:'2026-02-30'})).toThrow();
  });
  it('requires explicit matching choices, preserves notes and rejects reusing a manual match', async () => {
    const data = base(), row = manual(), req = await request();
    data.moneyFlow.brd = {accountId:'brd', rows:[row], imports:[]};
    const matches = brdImportMatches([row], req.statement.rows);
    expect(matches).toHaveLength(2);
    expect(() => prepareBrdImport(data, req)).toThrow('Review each');
    const reconciliation = Object.fromEntries(matches.map(match => [match.row.id, row.id]));
    expect(() => prepareBrdImport(data, {...req,reconciliation})).toThrow('only one');
    reconciliation[matches[1].row.id] = 'keep';
    const result = prepareBrdImport(data, {...req,reconciliation});
    expect(result.moneyFlow.brd.rows).toHaveLength(5);
    expect(result.moneyFlow.brd.rows.find(item => item.id === matches[0].row.id).notes).toBe('Keep this note');
    expect(result.moneyFlow.brd.rows.some(item => item.source === 'manual')).toBe(false);
    expect(result.accounts).toBe(data.accounts);
    expect(prepareBrdImport({...data,...result}, req).added).toBe(0);
    const kept = prepareBrdImport(data, {...req,reconciliation:Object.fromEntries(matches.map(match => [match.row.id,'keep']))});
    expect(kept.moneyFlow.brd.rows).toHaveLength(6);
    expect(brdImportMatches([manual({amount:'12.35'}), manual({category:'income'})], req.statement.rows)).toHaveLength(0);
  });
  it('adds, edits and confirms deletion of manual entries without touching account balances', () => {
    const setMoneyFlow = vi.fn(flow => { context.value.data = {...context.value.data,moneyFlow:flow}; });
    context.value = {data:base(),setMoneyFlow,runtimeConfig:{},syncStatus:{}};
    const setMonth = vi.fn();
    const {rerender} = render(<BrdCashflow month="2026-09" setMonth={setMonth} />);
    fireEvent.click(screen.getByRole('button',{name:'Add expense'}));
    fireEvent.change(screen.getByLabelText('Transaction date'),{target:{value:'2026-09-12'}});
    fireEvent.change(screen.getByLabelText('Amount (RON)'),{target:{value:'12.34'}});
    fireEvent.change(screen.getByLabelText('Counterparty'),{target:{value:'Synthetic shop'}});
    fireEvent.click(screen.getByRole('button',{name:'Save BRD transaction'}));
    expect(context.value.data.moneyFlow.brd.rows[0]).toMatchObject({source:'manual',amountMinor:1234});
    expect(setMonth).toHaveBeenCalledWith('2026-09');
    rerender(<BrdCashflow month="2026-09" setMonth={setMonth} />);
    fireEvent.click(screen.getByRole('button',{name:'Edit'}));
    fireEvent.change(screen.getByLabelText('Amount (RON)'),{target:{value:'15.60'}});
    fireEvent.click(screen.getByRole('button',{name:'Save BRD transaction'}));
    expect(context.value.data.moneyFlow.brd.rows).toHaveLength(1);
    expect(context.value.data.moneyFlow.brd.rows[0].amountMinor).toBe(1560);
    rerender(<BrdCashflow month="2026-09" setMonth={setMonth} />);
    fireEvent.click(screen.getByRole('button',{name:'Delete'}));
    expect(context.value.data.moneyFlow.brd.rows).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Confirm delete'}));
    expect(context.value.data.moneyFlow.brd.rows).toHaveLength(0);
    expect(context.value.data.accounts).toEqual(base().accounts);
  });
  it('uses exact cents, separates own transfers and cash, and excludes pending rows', async () => {
    const result=await parseBrdStatement(csv, [' OWN SAVINGS ']);
    expect(result.skipped).toBe(1); expect(result.rows).toHaveLength(5);
    expect(summarizeBrd(result.rows)).toEqual({income:100029,expense:2468,refund:0,transfersOut:20000,transfersIn:0,cash:5000,net:72561});
  });
  it('retains identical legitimate payments, but reimports and overlapping exports do not duplicate them', async () => {
    const data=base(), req=await request();
    const first=prepareBrdImport(data,req);
    expect(first.added).toBe(5);expect(req.statement.repeatedRows).toBe(1);
    const again=prepareBrdImport({...data,...first},req);
    expect(again.added).toBe(0);expect(again.duplicates).toBe(5);expect(again.moneyFlow.brd.imports).toHaveLength(1);
    const subset=await parseBrdStatement([header,...csv.split('\n').slice(3,5)].join('\n'));
    expect(prepareBrdImport({...data,...first},{...req,statement:subset}).added).toBe(0);
  });
  it('preserves existing manual records, Revolut transactions and other account balances', async () => {
    const data=base();data.transactions=[{desc:'unchanged'}];
    const result=prepareBrdImport(data,await request());
    expect(result.accounts).toBe(data.accounts);expect(result.moneyFlow.incomes).toEqual(data.moneyFlow.incomes);
    expect(result).not.toHaveProperty('transactions');expect(data.transactions).toEqual([{desc:'unchanged'}]);
  });
  it('updates only the explicitly confirmed BRD month and records its actual date', async () => {
    const data=base();const req={...await request(),balanceConfirmation:{date:'2026-10-06',amountMinor:1850000}};
    const result=prepareBrdImport(data,req);
    expect(result.accounts[0].balances).toEqual({'2026-09':500,'2026-10':18500});
    expect(result.accounts[0].notes['2026-10']).toContain('2026-10-06');
    expect(result.accounts[1]).toBe(data.accounts[1]);expect(data.accounts[0].balances).not.toHaveProperty('2026-10');
  });
  it('cannot attach BRD activity or its balance to another account', async () => {
    const req=await request();expect(()=>prepareBrdImport(base(),{...req,accountId:'other'})).toThrow('BRD RON');
  });
  it.each([
    ['12.34,RON','12.345,RON'],['1000.29,RON','-1000.29,RON'],['12.34,RON','12.34,EUR'],['2026-09-12','2026-02-30'],['DBIT','UNKNOWN'],
  ])('rejects invalid data: %s -> %s',async(from,to)=>{await expect(parseBrdStatement(csv.replace(from,to))).rejects.toThrow();});
  it('keeps a negative debit as a refund, not new income or another expense', async () => {
    const statement=await parseBrdStatement([header,'2026-09-12,Synthetic shop,POS,-25.50,RON,DBIT,PROCESSED'].join('\n'));
    expect(statement.rows[0]).toMatchObject({amountMinor:2550,reversal:true,category:'refund'});
    expect(summarizeBrd(statement.rows)).toMatchObject({income:0,expense:0,refund:2550,net:2550});
  });
  it('rejects unrecognized files and duplicate stored row IDs', async () => {
    await expect(parseBrdStatement('x,y\n1,2')).rejects.toThrow();
    const result=prepareBrdImport(base(),await request());result.moneyFlow.brd.rows.push(result.moneyFlow.brd.rows[0]);
    expect(MoneyFlowSchema.safeParse(result.moneyFlow).success).toBe(false);
  });
  it('shows a dated balance and distinct flows only for BRD, allows correction without changing balances', async () => {
    const prepared=prepareBrdImport(base(),await request());
    const setMoneyFlow=vi.fn();context.value={data:{...base(),...prepared},setMoneyFlow,runtimeConfig:{},syncStatus:{},commitBrdStatement:vi.fn()};
    render(<BrdCashflow month="2026-09" setMonth={vi.fn()} />);
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText('Cash withdrawn')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Classification for 2026-09-11 Own savings'),{target:{value:'expense'}});
    expect(setMoneyFlow.mock.calls[0][0].brd.rows.find(row=>row.beneficiary==='Own savings').category).toBe('expense');
    expect(context.value.data.accounts[0].balances).toEqual({'2026-09':500});
  });
  it('hides the BRD section when there is no BRD account', () => {
    context.value={data:{accounts:[],moneyFlow:{incomes:[],transfers:[]}},runtimeConfig:{},syncStatus:{}};
    const {container}=render(<BrdCashflow month="2026-09" setMonth={vi.fn()} />);expect(container).toBeEmptyDOMElement();
  });
});
