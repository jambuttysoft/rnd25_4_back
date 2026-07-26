export interface LineItem {
  id: string;
  description: string;
  amount: number;
  category?: string;
}

export interface Receipt {
  id: string;
  filename: string;
  imageDataUrl?: string;
  uploadedAt: string;
  ocrStatus: string;
  ocrLog: string[];
  merchant: string;
  date: string;
  total: number;
  lineItems: LineItem[];
  cashOut: boolean;
  loyaltyPointsSpent: number;
  cardFeeAmount: number;
  netGoodsAmount: number;
  changeAmount?: number;
  paidByCard?: number;
}

export interface PolicyFlag {
  rule: string;
  message: string;
  severity: "info" | "warning" | "error";
  receiptId: string;
}

export interface RuleCheck {
  ruleId: string;
  ruleName: string;
  category: string;
  passed: boolean;
  score: 0 | 1;
  detail: string;
}

export interface ComplianceSummary {
  totalRules: number;
  passedRules: number;
  failedRules: number;
  score: number;
  percentage: number;
  threshold: number;
  isCompliant: boolean;
  ruleChecks: RuleCheck[];
}

export interface JournalEntryLine {
  accountCode: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  taxRate?: string;
}

export interface JournalEntry {
  id: string;
  receiptId: string;
  merchant: string;
  date: string;
  total: number;
  lines: JournalEntryLine[];
  summary: string;
  createdAt: string;
}

export interface CategoryBucket {
  category: string;
  total: number;
  count: number;
  itemIds: string[];
}

export interface PipelineResult {
  byCategory: CategoryBucket[];
  totalExpenses: number;
  totalItems: number;
  cashOutDetected: boolean;
  cashOutAmount: number;
  policyFlags: PolicyFlag[];
  receiptId: string;
  complianceSummary: ComplianceSummary;
  journalEntry: JournalEntry | null;
}
