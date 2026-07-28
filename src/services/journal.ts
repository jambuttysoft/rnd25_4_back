import { v4 as uuid } from 'uuid';
import type { JournalEntry, JournalEntryLine, WorkflowResult, Receipt } from '../types/workflow.js';
type PipelineResult = WorkflowResult;

export const CATEGORY_ACCOUNT_CODES: Record<string, string> = {
  Fuel: '6410',
  Food: '6420',
  Transport: '6430',
  Accommodation: '6440',
  Training: '6450',
  Equipment: '6460',
  Office: '6470',
  Other: '6490',
};

export const OWNER_DRAWINGS_CODE = '6500';
export const PETTY_CASH_CODE = '1100';
export const ACCOUNTS_PAYABLE_CODE = '2100';

const CASH_OUT_KEYWORD_RE = /cash|withdrawal|atm/i;

export function computeCashOutAmount(receipt: Receipt): number {
  const changeAmount = receipt.changeAmount ?? 0;
  const paidByCard = receipt.paidByCard ?? 0;
  const cardChangeAmount = paidByCard > 0 && changeAmount > 0 ? changeAmount : 0;
  const explicitAmount = receipt.lineItems
    .filter((li) => CASH_OUT_KEYWORD_RE.test(li.description))
    .reduce((sum, li) => sum + (li.amount ?? 0), 0);
  const impliedAmount = receipt.cashOut
    ? Math.max(0, receipt.total - receipt.netGoodsAmount - receipt.cardFeeAmount)
    : 0;
  return Math.max(cardChangeAmount, explicitAmount, impliedAmount);
}

export function generateJournalEntry(result: PipelineResult, receipt: Receipt): JournalEntry | null {
  if (!result.complianceSummary.isCompliant) return null;

  const lines: JournalEntryLine[] = [];

  for (const bucket of result.byCategory) {
    const accountCode = CATEGORY_ACCOUNT_CODES[bucket.category] ?? '6490';
    lines.push({
      accountCode,
      description: `${bucket.category} expenses - ${receipt.merchant}`,
      amount: +bucket.total.toFixed(2),
      type: 'debit',
    });
  }

  const cashOutAmount = +(result.cashOutAmount ?? 0).toFixed(2);
  if (result.cashOutDetected && cashOutAmount > 0) {
    lines.push({
      accountCode: OWNER_DRAWINGS_CODE,
      description: `Owner drawings - ${receipt.merchant}`,
      amount: cashOutAmount,
      type: 'debit',
      taxRate: 'GST Free',
    });
  }

  const totalDebits = +lines.reduce((a, l) => a + l.amount, 0).toFixed(2);
  lines.push({
    accountCode: ACCOUNTS_PAYABLE_CODE,
    description: `Accounts payable - ${receipt.merchant}`,
    amount: totalDebits,
    type: 'credit',
  });

  return {
    id: `je-${uuid().slice(0, 8)}`,
    receiptId: receipt.id,
    merchant: receipt.merchant,
    date: receipt.date,
    total: totalDebits,
    lines,
    summary: `Expense allocation for ${receipt.merchant} - ${receipt.date}`,
    createdAt: new Date().toISOString(),
  };
}

export function journalEntryToCSV(entry: JournalEntry): string {
  const header = 'AccountCode,Description,DebitAmount,CreditAmount,TaxRate';
  const rows = entry.lines.map(l => {
    const debit = l.type === 'debit' ? l.amount.toFixed(2) : '';
    const credit = l.type === 'credit' ? l.amount.toFixed(2) : '';
    const taxRate = l.taxRate ?? '';
    return `"${l.accountCode}","${l.description.replace(/"/g, '""')}","${debit}","${credit}","${taxRate}"`;
  });
  return [header, ...rows].join('\n');
}
