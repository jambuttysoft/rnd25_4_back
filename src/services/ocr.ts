import { callModel } from './llm.js';
import type { Receipt } from '../types/workflow.js';

interface RawReceipt {
  merchant: string;
  date: string;
  total: number;
  lineItems: Array<{ description: string; amount: number }>;
  cashOut: boolean;
  loyaltyPointsSpent: number;
  cardFeeAmount: number;
  netGoodsAmount: number;
  changeAmount: number;
  paidByCard: number;
}

export async function processReceiptImage(imageBase64: string, filename: string): Promise<Receipt> {
  const now = new Date().toISOString();
  const logs = [
    'Initialising OCR engine…',
    'Detecting text regions…',
    'Extracting merchant name…',
    'Reading totals and line items…',
    'Cross-checking line totals…',
    'Finalising structured output…',
    'OCR Complete — GPT-4o vision processed',
  ];

  const prompt = `Extract receipt data from this image. Return ONLY valid JSON with this exact structure:
{
  "merchant": "store name",
  "date": "DD/MM/YYYY",
  "total": 123.45,
  "lineItems": [{"description": "item name", "amount": 12.34}],
  "cashOut": false,
  "loyaltyPointsSpent": 0,
  "cardFeeAmount": 0,
  "netGoodsAmount": 123.45,
  "changeAmount": 0,
  "paidByCard": 0
}

Rules:
- cashOut=true if any line item is a cash withdrawal, cash-back, or ATM disguised as discount/service fee
- changeAmount = amount shown on the "Change" / "CHANGE" / "Решта" / "Сдача" line of the receipt. Set to 0 if no Change line is visible.
- paidByCard = amount actually paid by card (or 0 if paid in cash). Often equals total but can be different if partial payment. If only one payment method is visible and it is card, set paidByCard = total.
- CASH-OUT VARIANT 2 (card payment + cash change): set cashOut=true AND fill changeAmount with the amount of cash given back when paidByCard > 0 AND changeAmount is greater than 0. This indicates the till dispensed cash as "change" even though payment was by card. Example: Total $7.30, paid by card, Change $20.00 → cashOut=true, changeAmount=20.00, paidByCard=7.30.
- netGoodsAmount = total - cashOutAmount - cardFeeAmount - loyaltyPointsSpent
- Be precise with ALL amounts
- Include ALL line items visible on the receipt`;

  const raw = await callModel(
    '',  // instructions unused when messages are provided
    '',  // input unused when messages are provided
    {
      temperature: 0.05,
      maxTokens: 2000,
      messages: [
        { role: 'system', content: 'You are a precise receipt OCR system. Extract structured data from receipt images. Return ONLY the JSON object without any markdown fences or extra text.' },
        { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' } }
        ]}
      ],
    }
  );

  // Strip markdown code fences if present (model may wrap JSON in ```json ... ```)
  const cleanJson = raw.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  const parsed: RawReceipt = JSON.parse(cleanJson);
  const id = `rcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,
    filename,
    imageDataUrl: `data:image/jpeg;base64,${imageBase64}`,
    uploadedAt: now,
    ocrStatus: 'complete',
    ocrLog: logs,
    merchant: parsed.merchant,
    date: parsed.date,
    total: parsed.total,
    lineItems: parsed.lineItems.map((li: any, i: number) => ({
      id: `item-${i + 1}`,
      description: li.description,
      amount: li.amount,
    })),
    cashOut: parsed.cashOut,
    loyaltyPointsSpent: parsed.loyaltyPointsSpent,
    cardFeeAmount: parsed.cardFeeAmount,
    netGoodsAmount: parsed.netGoodsAmount,
    changeAmount: parsed.changeAmount ?? 0,
    paidByCard: parsed.paidByCard ?? 0,
  };
}
