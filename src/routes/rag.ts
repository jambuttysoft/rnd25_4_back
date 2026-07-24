import { Router } from 'express';
import { searchPolicies, checkPolicyCompliance } from '../services/rag.js';

export const ragRouter = Router();

ragRouter.post('/search', async (req, res, next) => {
  try {
    const { query, topK } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    const results = await searchPolicies(query, topK ?? 5);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

ragRouter.post('/policy-check', async (req, res, next) => {
  try {
    const { receipt } = req.body;
    if (!receipt) return res.status(400).json({ error: 'Missing receipt' });
    const result = await checkPolicyCompliance(receipt);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
