import fs from 'node:fs';

/**
 * Priority: .env.test.local > .env.test > .env.local > .env
 */
function getEnvFilePath(): URL | undefined {
  const files = ['.env.test.local', '.env.test', '.env.local', '.env'];

  return files.map((f) => new URL(f, import.meta.url)).find((p) => fs.existsSync(p));
}

export function setup() {
  process.loadEnvFile(getEnvFilePath());
}

export function teardown() {
  // no-op
}
