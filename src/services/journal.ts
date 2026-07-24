import { v4 as uuid } from 'uuid';
import type { JournalEntry, JournalEntryLine, PipelineResult, Receipt } from '../types/pipeline.js';

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

  if (result.cashOutDetected) {
    lines.push({
      accountCode: '6510',
      description: `Cash-out detected - ${receipt.merchant} - needs review`,
      amount: 0,
      type: 'debit',
    });
  }

  lines.push({
    accountCode: '2100',
    description: `Accounts payable - ${receipt.merchant}`,
    amount: +result.totalExpenses.toFixed(2),
    type: 'credit',
  });

  return {
    id: `je-${uuid().slice(0, 8)}`,
    receiptId: receipt.id,
    merchant: receipt.merchant,
    date: receipt.date,
    total: result.totalExpenses,
    lines,
    summary: `Expense allocation for ${receipt.merchant} - ${receipt.date}`,
    createdAt: new Date().toISOString(),
  };
}

export function journalEntryToCSV(entry: JournalEntry): string {
  const header = 'AccountCode,Description,DebitAmount,CreditAmount';
  const rows = entry.lines.map(l => {
    const debit = l.type === 'debit' ? l.amount.toFixed(2) : '';
    const credit = l.type === 'credit' ? l.amount.toFixed(2) : '';
    return `"${l.accountCode}","${l.description.replace(/"/g, '""')}","${debit}","${credit}"`;
  });
  return [header, ...rows].join('\n');
}
