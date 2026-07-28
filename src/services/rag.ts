import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callModel } from './llm.js';
import type { Receipt, PolicyFlag, RuleCheck } from '../types/workflow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PolicyParagraph {
  id: string;
  text: string;
}

interface PolicyDoc {
  id: string;
  title: string;
  paragraphs: PolicyParagraph[];
}

interface SearchResult {
  paragraphId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  score: number;
}

function loadPolicies(): PolicyDoc[] {
  const filePath = path.resolve(__dirname, '../../data/policies.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadSynonyms(): Record<string, string[]> {
  const filePath = path.resolve(__dirname, '../../data/synonyms.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'also', 'any', 'per', 'up', 'out', 'about',
  'into', 'over', 'after', 'before', 'between', 'under', 'above',
  'below', 'this', 'that', 'these', 'those', 'it', 'its',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function buildTFIDF(paragraphs: Array<{ id: string; text: string }>) {
  const N = paragraphs.length;
  const termDocs = new Map<string, Set<string>>();

  for (const p of paragraphs) {
    const unique = new Set(tokenize(p.text));
    for (const t of unique) {
      if (!termDocs.has(t)) termDocs.set(t, new Set());
      termDocs.get(t)!.add(p.id);
    }
  }

  const vectors = new Map<string, Map<string, number>>();
  for (const p of paragraphs) {
    const terms = tokenize(p.text);
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vector = new Map<string, number>();
    for (const [term, count] of tf) {
      const idf = Math.log(N / (1 + (termDocs.get(term)?.size ?? 0)));
      vector.set(term, (count / terms.length) * idf);
    }
    vectors.set(p.id, vector);
  }
  return vectors;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [term, val] of a) {
    normA += val * val;
    dot += val * (b.get(term) ?? 0);
  }
  for (const [, val] of b) normB += val * val;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

let cachedVectors: Map<string, Map<string, number>> | null = null;
let cachedParagraphs: Array<{ id: string; text: string; docId: string; docTitle: string }> = [];

function ensureIndex() {
  if (cachedVectors) return;
  const policies = loadPolicies();
  const all: Array<{ id: string; text: string; docId: string; docTitle: string }> = [];
  for (const doc of policies) {
    for (const p of doc.paragraphs) {
      all.push({ id: `${doc.id}::${p.id}`, text: p.text, docId: doc.id, docTitle: doc.title });
    }
  }
  cachedParagraphs = all;
  cachedVectors = buildTFIDF(all);
}

function applySynonymBonus(queryTerms: string[], text: string): number {
  const synonyms = loadSynonyms();
  let matches = 0;
  for (const [, group] of Object.entries(synonyms)) {
    const queryMatch = queryTerms.some(t => group.includes(t));
    const textMatch = group.some(s => text.toLowerCase().includes(s));
    if (queryMatch && textMatch) matches++;
  }
  if (matches >= 2) return 0.25;
  if (matches === 1) return 0.15;
  return 0;
}

export async function searchPolicies(query: string, topK: number = 5): Promise<SearchResult[]> {
  ensureIndex();
  const queryTerms = tokenize(query);
  const qVec = new Map<string, number>();
  for (const t of queryTerms) qVec.set(t, (qVec.get(t) ?? 0) + 1);

  const results: SearchResult[] = [];
  for (const p of cachedParagraphs) {
    const vec = cachedVectors!.get(p.id);
    if (!vec) continue;
    let score = cosineSimilarity(qVec, vec);
    score += applySynonymBonus(queryTerms, p.text);
    results.push({
      paragraphId: p.id,
      documentId: p.docId,
      documentTitle: p.docTitle,
      text: p.text,
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK).filter(r => r.score > 0.01);
}

export async function checkPolicyCompliance(receipt: Receipt): Promise<{
  flags: PolicyFlag[];
  ruleChecks: RuleCheck[];
  categories: any[];
}> {
  const receiptData = {
    merchant: receipt.merchant,
    total: receipt.total,
    lineItems: receipt.lineItems.map(li => ({ description: li.description, amount: li.amount })),
    cashOut: receipt.cashOut,
  };

  const relevantParagraphs = await searchPolicies(
    `${receipt.merchant} ${receipt.lineItems.map(l => l.description).join(' ')}`,
    8
  );

  const policyContext = relevantParagraphs.map(r => `[${r.documentTitle}] ${r.text}`).join('\n\n');

  const prompt = `You are a corporate policy compliance officer. Analyze this receipt against company policies.

RECEIPT:
${JSON.stringify(receiptData, null, 2)}

RELEVANT POLICIES:
${policyContext}

Return ONLY valid JSON with exact structure:
{
  "flags": [{ "rule": "policy.meal", "message": "Meal exceeds $35 limit", "severity": "warning" }],
  "categories": [{ "description": "item", "amount": 10, "category": "Food" }],
  "ruleChecks": [{ "ruleId": "check-1", "ruleName": "Meal limit check", "category": "policy", "passed": true, "score": 1, "detail": "All meals within policy" }]
}

Rules:
- Categories: Fuel, Food, Transport, Accommodation, Training, Equipment, Office, Other
- Each flag references a specific policy rule
- Each line item gets a category
- Rule checks cover: cash-out, meal limits ($35), hotel limits ($250), fuel limits (60L)
- Set passed=false if violation exists`;

  const raw = await callModel(
    'You are a corporate policy compliance officer. Analyze receipts against policies. Return JSON only.',
    prompt,
    { temperature: 0.1, maxTokens: 3000 }
  );

  const parsed = JSON.parse(raw);
  return {
    flags: (parsed.flags || []).map((f: any) => ({
      ...f,
      receiptId: receipt.id,
      severity: f.severity || 'warning',
    })),
    ruleChecks: (parsed.ruleChecks || []).map((r: any) => ({
      ...r,
      score: r.passed ? 1 as const : 0 as const,
    })),
    categories: parsed.categories || [],
  };
}
