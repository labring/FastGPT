import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

type LoadVectorEnvOptions = {
  envFileNames?: string[];
};

const parseEnvFile = (filePath: string) => {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) continue;
    process.env[key] = value;
  }
};

export const loadVectorDBEnv = (options: LoadVectorEnvOptions = {}) => {
  const envFileNames = options.envFileNames ?? ['.env.test.local'];
  // __dirname is test/utils/, go up one level to test/
  const baseDir = resolve(__dirname, '..');

  for (const envFileName of envFileNames) {
    const filePath = resolve(baseDir, envFileName);
    if (existsSync(filePath)) {
      parseEnvFile(filePath);
    }
  }
};
