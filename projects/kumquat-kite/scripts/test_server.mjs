#!/usr/bin/env node
// The browser tests' app server (playwright.config.mjs): the real server, on its own port (8788 by default), against the
// isolated test database, which it first resets to the starting demo data (scripts/lib/testdb.mjs refuses anything but
// a local database whose name ends in _test). The demo database and the dev server on 8787 are never touched.
import { resetTestDatabase } from './lib/testdb.mjs';
import { describeDb } from './lib/db.mjs';

const settings = await resetTestDatabase();
const { startServer } = await import('../server/server.mjs');
const s = await startServer({ port: Number(process.env.KK_TEST_PORT || 8788), build: process.env.SKIP_BUILD !== '1' });
console.log(`test server on ${s.url} (database ${describeDb(settings)}, reset to the starting demo data)`);
const stop = async () => { await s.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
