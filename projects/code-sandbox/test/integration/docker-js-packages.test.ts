import { describe, expect, it } from 'vitest';

const baseUrl = process.env.CODE_SANDBOX_URL?.replace(/\/$/, '');
const token = process.env.SANDBOX_TOKEN || '';
const shouldRun = Boolean(baseUrl);

type SandboxResponse = {
  success: boolean;
  data?: {
    codeReturn?: any;
    log?: string;
  };
  message?: string;
};

async function runJs(code: string, variables: Record<string, any> = {}) {
  if (!baseUrl) throw new Error('CODE_SANDBOX_URL is required');

  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}/sandbox/js`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code,
      variables,
      timeoutMs: 30000
    })
  });

  const json = (await res.json()) as SandboxResponse;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (!json.success) {
    throw new Error(json.message || JSON.stringify(json));
  }
  return json;
}

describe.skipIf(!shouldRun)('Docker JS 预装包集成测试', () => {
  it('health ready', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('lodash 可 require 并执行常用集合函数', async () => {
    const result = await runJs(`
async function main() {
  const _ = require('lodash');
  const grouped = _.groupBy([
    { team: 'a', score: 1 },
    { team: 'a', score: 3 },
    { team: 'b', score: 2 }
  ], 'team');
  return {
    chunks: _.chunk([1, 2, 3, 4, 5], 2),
    sumA: _.sumBy(grouped.a, 'score'),
    sumB: _.sumBy(grouped.b, 'score')
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.chunks).toEqual([[1, 2], [3, 4], [5]]);
    expect(result.data?.codeReturn.sumA).toBe(4);
    expect(result.data?.codeReturn.sumB).toBe(2);
  });

  it('moment 可 require 并处理日期', async () => {
    const result = await runJs(`
async function main() {
  const moment = require('moment');
  return {
    value: moment.utc('2024-01-15T12:00:00Z').add(3, 'hours').format('YYYY-MM-DD HH:mm')
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.value).toBe('2024-01-15 15:00');
  });

  it('dayjs 可 require 并处理日期', async () => {
    const result = await runJs(`
async function main() {
  const dayjs = require('dayjs');
  return {
    value: dayjs('2024-01-15T12:00:00Z').add(2, 'day').format('YYYY-MM-DD')
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.value).toBe('2024-01-17');
  });

  it('crypto-js 可 require 并计算哈希', async () => {
    const result = await runJs(`
async function main() {
  const CryptoJS = require('crypto-js');
  return {
    sha256: CryptoJS.SHA256('fastgpt').toString()
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.sha256).toBe(
      '046ca27ed8a95d7aaec3fd577ba8d9eabd7f7915de4e7c0e120d06d758bff75a'
    );
  });

  it('uuid 可 require 并生成 UUID', async () => {
    const result = await runJs(`
async function main() {
  const { v5, validate } = require('uuid');
  const id = v5('fastgpt', v5.URL);
  return {
    id,
    valid: validate(id)
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.valid).toBe(true);
    expect(result.data?.codeReturn.id).toBe('8d10dc2b-3d86-5ae4-b41b-a42c6000e3eb');
  });

  it('qs 可 require 并处理查询串', async () => {
    const result = await runJs(`
async function main() {
  const qs = require('qs');
  return {
    parsed: qs.parse('a%5Bb%5D=1&list%5B0%5D=2&list%5B1%5D=3'),
    text: qs.stringify({ a: { b: 1 }, list: [2, 3] })
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.parsed).toEqual({ a: { b: '1' }, list: ['2', '3'] });
    expect(result.data?.codeReturn.text).toContain('a%5Bb%5D=1');
  });

  it('url 可 require 并解析 URL', async () => {
    const result = await runJs(`
async function main() {
  const url = require('url');
  const parsed = url.parse('https://example.com/a?b=1', true);
  return {
    hostname: parsed.hostname,
    query: parsed.query.b
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      hostname: 'example.com',
      query: '1'
    });
  });

  it('querystring 可 require 并处理查询串', async () => {
    const result = await runJs(`
async function main() {
  const querystring = require('querystring');
  return {
    parsed: querystring.parse('a=1&b=2'),
    text: querystring.stringify({ a: 1, b: 2 })
  };
}`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.parsed).toEqual({ a: '1', b: '2' });
    expect(result.data?.codeReturn.text).toContain('a=1');
  });

  it.each(['child_process', 'fs', 'net', 'http', 'https'])(
    '危险模块 %s 不能 require',
    async (moduleName) => {
      const result = await runJs(`
async function main() {
  try {
    require(${JSON.stringify(moduleName)});
    return { blocked: false };
  } catch (e) {
    return { blocked: true, message: String(e.message || e) };
  }
}`);

      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
      expect(result.data?.codeReturn.message).toMatch(/not allowed|denied|forbidden/i);
    }
  );
});
