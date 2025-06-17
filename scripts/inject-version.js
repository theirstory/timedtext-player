import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const distFile = join('./dist', 'timedtext-player.js');

try {
  let content = readFileSync(distFile, 'utf8');
  content = content.replace(/'__TIMEDTEXT_PLAYER_VERSION__'/g, `'${pkg.version}'`);
  writeFileSync(distFile, content, 'utf8');
  console.log(`✓ Version ${pkg.version} injected into ${distFile}`);
} catch (error) {
  console.error('Error injecting version:', error.message);
  process.exit(1);
}
