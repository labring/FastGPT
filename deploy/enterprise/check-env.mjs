#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const envFile = process.argv[2] || 'deploy/enterprise/.env.enterprise';
const envPath = path.resolve(process.cwd(), envFile);

const requiredKeys = [
  'FE_DOMAIN',
  'FILE_DOMAIN',
  'STORAGE_EXTERNAL_ENDPOINT',
  'ALLOWED_ORIGINS',
  'USE_IP_LIMIT',
  'CHECK_INTERNAL_IP',
  'TRUSTED_PROXY_ENABLE',
  'TRUSTED_PROXY_IPS',
  'PASSWORD_LOGIN_LOCK_SECONDS',
  'PASSWORD_EXPIRED_MONTH',
  'MAX_LOGIN_SESSION',
  'DEFAULT_ROOT_PSW',
  'TOKEN_KEY',
  'FILE_TOKEN_KEY',
  'AES256_SECRET_KEY',
  'ROOT_KEY',
  'PLUGIN_TOKEN',
  'CODE_SANDBOX_TOKEN',
  'AGENT_SANDBOX_PROXY_SECRET',
  'AGENT_SANDBOX_VOLUME_MANAGER_TOKEN',
  'AIPROXY_API_TOKEN',
  'MONGODB_URI',
  'PG_URL',
  'REDIS_URL',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'SANDBOX_CHECK_INTERNAL_IP'
];

const weakValues = new Set([
  '',
  '1234',
  '123456',
  'password',
  'mypassword',
  'fastgpt',
  'fastgptsecret',
  'fastgpt-xxx',
  'fdafasd',
  'token',
  'codesandbox',
  'vmtoken',
  'minioadmin',
  'default_fastgpt_agent_sandbox_proxy_secret'
]);

const secretKeys = [
  'DEFAULT_ROOT_PSW',
  'TOKEN_KEY',
  'FILE_TOKEN_KEY',
  'AES256_SECRET_KEY',
  'ROOT_KEY',
  'PLUGIN_TOKEN',
  'CODE_SANDBOX_TOKEN',
  'AGENT_SANDBOX_PROXY_SECRET',
  'AGENT_SANDBOX_VOLUME_MANAGER_TOKEN',
  'AIPROXY_API_TOKEN',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD'
];

const booleanTrueKeys = [
  'USE_IP_LIMIT',
  'CHECK_INTERNAL_IP',
  'TRUSTED_PROXY_ENABLE',
  'SANDBOX_CHECK_INTERNAL_IP'
];

const urlKeys = ['FE_DOMAIN', 'FILE_DOMAIN', 'STORAGE_EXTERNAL_ENDPOINT'];

const errors = [];
const warnings = [];

if (!fs.existsSync(envPath)) {
  errors.push(`Env file not found: ${envPath}`);
  printAndExit();
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

for (const key of requiredKeys) {
  if (!env[key]) {
    errors.push(`${key} is required`);
  }
}

for (const key of secretKeys) {
  const value = env[key] || '';
  if (value.includes('<') || value.includes('>')) {
    errors.push(`${key} still contains a placeholder`);
  }
  if (weakValues.has(value.toLowerCase())) {
    errors.push(`${key} uses a known weak default value`);
  }
  if (value && value.length < 24) {
    warnings.push(`${key} is shorter than 24 characters; use a high-entropy random value`);
  }
}

for (const key of booleanTrueKeys) {
  if ((env[key] || '').toLowerCase() !== 'true') {
    errors.push(`${key} must be true for enterprise internal deployment`);
  }
}

for (const key of urlKeys) {
  const value = env[key] || '';
  if (!value.startsWith('https://')) {
    errors.push(`${key} must use https:// in production`);
  }
  if (isLocalUrl(value)) {
    errors.push(`${key} must not use localhost, 127.0.0.1, or 0.0.0.0`);
  }
}

if (env.ALLOWED_ORIGINS === '*' || env.ALLOWED_ORIGINS?.toLowerCase() === 'all') {
  errors.push('ALLOWED_ORIGINS must be an explicit comma-separated allowlist');
}

if (!env.TRUSTED_PROXY_IPS?.trim()) {
  errors.push('TRUSTED_PROXY_IPS must include the reverse proxy IP or CIDR');
}

const loginLockSeconds = Number(env.PASSWORD_LOGIN_LOCK_SECONDS);
if (!Number.isFinite(loginLockSeconds) || loginLockSeconds < 60) {
  errors.push('PASSWORD_LOGIN_LOCK_SECONDS must be at least 60 seconds');
}

const maxLoginSession = Number(env.MAX_LOGIN_SESSION);
if (!Number.isFinite(maxLoginSession) || maxLoginSession < 1 || maxLoginSession > 5) {
  warnings.push('MAX_LOGIN_SESSION should usually be between 1 and 5 for internal deployments');
}

for (const key of ['MONGODB_URI', 'PG_URL', 'REDIS_URL']) {
  const value = env[key] || '';
  for (const weakValue of weakValues) {
    if (weakValue && value.toLowerCase().includes(weakValue)) {
      errors.push(`${key} contains weak default credential fragment "${weakValue}"`);
      break;
    }
  }
}

if ((env.LOG_CONSOLE_LEVEL || '').toLowerCase() === 'debug') {
  warnings.push('LOG_CONSOLE_LEVEL=debug may expose sensitive details in production logs');
}

printAndExit();

function parseEnv(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function printAndExit() {
  if (warnings.length > 0) {
    console.warn('Warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error('Errors:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Enterprise env check passed: ${envPath}`);
}
