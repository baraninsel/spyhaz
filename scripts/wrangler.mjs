import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const cli = resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const args = process.argv.slice(2);
if (args[0] === 'dev' && !args.includes('--persist-to')) {
  const id = createHash('sha256').update(process.cwd()).digest('hex').slice(0, 10);
  args.push('--persist-to', process.env.SPYHAZ_STATE_DIR || resolve(tmpdir(), 'spyhaz-dev-' + id));
}
const child = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit', env: { ...process.env, WRANGLER_LOG_PATH: resolve('.wrangler/logs'), WRANGLER_SEND_METRICS: 'false' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
