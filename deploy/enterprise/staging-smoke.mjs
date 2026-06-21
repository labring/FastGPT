#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [, , envFile = 'deploy/enterprise/.env.example'] = process.argv;
const composeFile = 'deploy/runtime/docker-compose.enterprise.yml';

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
};

const readEnv = (file) => {
  const env = {};
  const content = readFileSync(file, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index < 0) continue;

    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^"(.*)"$/, '$1');
    env[key] = value;
  }

  return env;
};

const smokeHttp = async (baseUrl) => {
  const url = new URL('/api/common/system/getInitData', baseUrl);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP smoke failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('HTTP smoke failed: response is not JSON object');
  }

  console.log(`HTTP smoke passed: ${url.toString()}`);
};

try {
  console.log(`Checking env file: ${envFile}`);
  run('node', ['deploy/enterprise/check-env.mjs', envFile]);

  console.log(`Checking compose file: ${composeFile}`);
  run('docker', ['compose', '--env-file', envFile, '-f', composeFile, 'config', '--quiet']);

  const env = readEnv(envFile);
  const baseUrl = env.FASTGPT_STAGING_BASE_URL || process.env.FASTGPT_STAGING_BASE_URL;
  if (baseUrl) {
    await smokeHttp(baseUrl);
  } else {
    console.log('HTTP smoke skipped: set FASTGPT_STAGING_BASE_URL to probe a running staging app.');
  }

  console.log('Enterprise staging smoke passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
