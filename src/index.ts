import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ocrRouter } from './routes/ocr.js';
import { ragRouter } from './routes/rag.js';
import { pipelineRouter } from './routes/pipeline.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!allowedOrigins || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
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

// In production, serve static frontend if available
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = process.env.DIST_WEB_PATH || path.resolve(__dirname, '../../dist-web');
const indexPath = path.join(distPath, 'index.html');

if (fs.existsSync(indexPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(indexPath);
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Verification Backend API',
      health: '/api/health',
      timestamp: new Date().toISOString(),
    });
  });
  app.get('*', (_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] Verification backend running on http://localhost:${PORT}`);
  console.log(`[server] API health: http://localhost:${PORT}/api/health`);
});
