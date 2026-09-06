import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const data = await mkdtemp(join(tmpdir(), 'onestack-universal-'));
const port = process.env.TEST_APP_PORT ?? '53991';
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: resolve('examples/universal/.onestack/deploy/node'),
  env: { ...process.env, PORT: port, HOST: '127.0.0.1', DATA_DIR: data, DATABASE_URL: '', S3_BUCKET: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; server.stderr.on('data', chunk => { logs += chunk.toString(); });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(base); ready = response.ok; if (ready) break; } catch {}
    if (server.exitCode !== null) throw new Error(logs || 'Server exited');
    await setTimeout(100);
  }
  assert(ready, 'server should start');
  assert.match(await (await fetch(base)).text(), /OneStack Universal/);
  const signup = await fetch(base + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'smoke@example.com', password: 'a long integration test password' }) });
  const user = await signup.json(); assert(user.token, 'signup issues a session token');
  const call = (action, input = {}) => fetch(base + '/api/' + action, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${user.token}` }, body: JSON.stringify(input) });
  assert.equal((await (await call('notes', { text: 'integration note' })).json()).notes[0].text, 'integration note');
  assert((await (await call('upload', { text: 'file bytes' })).json()).key);
  assert.equal((await call('checkout')).status, 503, 'missing payment credentials fail explicitly');
  await call('signout'); assert.equal((await call('notes', { text: 'denied' })).ok, false);
  console.log('Universal HTTP smoke passed: assets, signup, notes, upload, payment configuration guard and revoked session.');
} finally {
  if (server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
  await rm(data, { recursive: true, force: true });
}
