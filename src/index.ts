import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ocrRouter } from './routes/ocr.js';
import { ragRouter } from './routes/rag.js';
import { pipelineRouter } from './routes/pipeline.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check with development mode flag
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    development: process.env.DEVELOPMENT !== 'false',
  });
});

// API routes
app.use('/api/ocr', ocrRouter);
app.use('/api/rag', ragRouter);
app.use('/api/pipeline', pipelineRouter);

// In production, serve static frontend
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../../dist-web');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] Verification backend running on http://localhost:${PORT}`);
  console.log(`[server] API health: http://localhost:${PORT}/api/health`);
});
