import fs from 'node:fs';

/**
 * Priority: .env.test.local > .env.test > .env.local > .env
 */
function getEnvFilePath(): URL | undefined {
  const files = ['.env.test.local', '.env.test', '.env.local', '.env'];
  const packageRoot = new URL('../', import.meta.url);

  return files.map((f) => new URL(f, packageRoot)).find((p) => fs.existsSync(p));
}

export function setup() {
  const envFilePath = getEnvFilePath();
  if (envFilePath) {
    process.loadEnvFile(envFilePath);
  }
}

export function teardown() {
  // no-op
}
