import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = readdirSync('dist/assets').filter((file) => file.endsWith('.js'));

if (!assets.length) {
  throw new Error('Demo build verification failed: no JavaScript asset was emitted.');
}

const bundles = assets.map(asset => ({asset,text:readFileSync(join('dist/assets',asset),'utf8')}));
const demo = bundles.find(bundle=>bundle.text.includes('createDemoRepository'));

if (!demo) {
  throw new Error('Demo build verification failed: the demo adapter is missing from the bundle.');
}

if (bundles.some(bundle=>bundle.text.includes('Set VITE_APP_MODE to demo or connected.'))) {
  throw new Error('Demo build verification failed: the runtime mode guard is still present.');
}

console.log(`Demo build verified across ${assets.length} chunks: ${demo.asset}`);

if (bundles.some(bundle=>/api\.resend\.com|fast2sms\.com|VITE_RESEND_API_KEY|VITE_FAST2SMS_API_KEY/.test(bundle.text))) throw new Error('Browser provider-secret/transport path detected.');
