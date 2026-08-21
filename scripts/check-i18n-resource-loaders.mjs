import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'generate-i18n-resource-loaders.mjs'
);
execFileSync(process.execPath, [scriptPath, '--check'], { stdio: 'inherit' });
