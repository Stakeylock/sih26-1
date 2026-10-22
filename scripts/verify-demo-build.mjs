import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const asset = readdirSync('dist/assets').find((file) => file.endsWith('.js'));

if (!asset) {
  throw new Error('Demo build verification failed: no JavaScript asset was emitted.');
}

const bundle = readFileSync(join('dist/assets', asset), 'utf8');

if (!bundle.includes('createDemoRepository')) {
  throw new Error('Demo build verification failed: the demo adapter is missing from the bundle.');
}

if (bundle.includes('Set VITE_APP_MODE to demo or connected.')) {
  throw new Error('Demo build verification failed: the runtime mode guard is still present.');
}

console.log(`Demo build verified: ${asset}`);
