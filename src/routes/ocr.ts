import { Router } from 'express';
import { processReceiptImage } from '../services/ocr.js';

export const ocrRouter = Router();

ocrRouter.post('/', async (req, res, next) => {
  try {
    const { image, filename } = req.body;
    if (!image) return res.status(400).json({ error: 'Missing image field (base64)' });
    const receipt = await processReceiptImage(image, filename ?? 'receipt.jpg');
    res.json({ receipt });
  } catch (err) {
    next(err);
  }
});
