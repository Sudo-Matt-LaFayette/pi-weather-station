import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadSettings } from './config.js';
import { AppState } from './state.js';

// Compiled output lives in dist/server/server/, and the built client in dist/public/.
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const settings = await loadSettings(path.join(dataDir, 'settings.json'));
  const state = new AppState(dataDir, settings);
  await state.init();
  state.start();

  const server = createApp(state, publicDir).listen(port, host, () => {
    console.log(`Weather station listening on http://${host}:${port}`);
  });

  const shutdown = (): void => {
    state.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
