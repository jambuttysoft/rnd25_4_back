import { Router } from 'express';
import { checkPolicyCompliance } from '../services/rag.js';
import { computeCashOutAmount, generateJournalEntry } from '../services/journal.js';
import type { Receipt, PipelineResult, CategoryBucket, ComplianceSummary } from '../types/pipeline.js';

export const pipelineRouter = Router();

pipelineRouter.post('/run', async (req, res, next) => {
  try {
    const { receipt, threshold = 80 } = req.body as { receipt: Receipt; threshold?: number };
    if (!receipt) return res.status(400).json({ error: 'Missing receipt' });

    const { flags, ruleChecks, categories } = await checkPolicyCompliance(receipt);

    const byCategoryMap = new Map<string, CategoryBucket>();
    for (const item of categories) {
      const cat = item.category || 'Other';
      const existing = byCategoryMap.get(cat) ?? { category: cat, total: 0, count: 0, itemIds: [] as string[] };
      existing.total += item.amount;
      existing.count += 1;
      existing.itemIds.push(item.id);
      byCategoryMap.set(cat, existing);
    }

    const byCategory = Array.from(byCategoryMap.values()).filter(b => b.count > 0);
    const totalExpenses = +byCategory.reduce((a, b) => a + b.total, 0).toFixed(2);
    const cashOutDetected = receipt.cashOut;
    const totalRules = ruleChecks.length;
    const passedRules = ruleChecks.filter(r => r.passed).length;
    const score = totalRules > 0 ? passedRules / totalRules : 1;
    const percentage = Math.round(score * 100);

    const complianceSummary: ComplianceSummary = {
      totalRules, passedRules,
      failedRules: totalRules - passedRules,
      score, percentage, threshold,
      isCompliant: percentage >= threshold,
      ruleChecks,
    };

    const result: PipelineResult = {
      byCategory, totalExpenses,
      totalItems: receipt.lineItems.length,
      cashOutDetected,
      cashOutAmount: computeCashOutAmount(receipt),
      policyFlags: flags,
      receiptId: receipt.id,
      complianceSummary,
      journalEntry: null,
    };

    result.journalEntry = generateJournalEntry(result, receipt);
    res.json({ result });
  } catch (err) {
    next(err);
  }
});
