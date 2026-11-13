import path from 'node:path';
import express from 'express';
import { mergeSettings, validateSettings } from './config.js';
import { searchLocations } from './providers/geocoding.js';
import type { AppState } from './state.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function createApp(state: AppState, publicDir: string): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json(state.health());
  });

  app.get('/api/settings', (_req, res) => {
    res.json(state.getSettings());
  });

  // Settings writes are limited to the Pi itself.
  app.put('/api/settings', async (req, res) => {
    if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) {
      res.status(403).json({ error: 'Settings can only be changed from the Pi itself' });
      return;
    }
    const result = validateSettings(mergeSettings(state.getSettings(), req.body));
    if (!result.ok) {
      res.status(400).json({ errors: result.errors });
      return;
    }
    try {
      await state.updateSettings(result.value);
      res.json(result.value);
    } catch {
      res.status(500).json({ error: 'Could not save settings' });
    }
  });

  app.get('/api/weather', (_req, res) => {
    res.json(state.weatherEnvelope());
  });

  app.get('/api/alerts', (_req, res) => {
    res.json(state.alertsEnvelope());
  });

  app.get('/api/radar/frames', (_req, res) => {
    res.json(state.radarEnvelope());
  });

  app.get('/api/location/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2 || q.length > 100) {
      res.status(400).json({ error: 'q must be 2-100 characters' });
      return;
    }
    try {
      res.json(await searchLocations(q));
    } catch {
      res.status(502).json({ error: 'Location search is unavailable right now' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
