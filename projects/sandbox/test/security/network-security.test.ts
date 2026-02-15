import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';
import type { RunnerConfig } from '../../src/types';

const config: RunnerConfig = {
  defaultTimeoutMs: 15000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
};

describe('网络安全 - JS', () => {
  let runner: JsRunner;
  beforeAll(() => { runner = new JsRunner(config); });

  // ===== 直接网络访问禁止 =====

  it('fetch 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { hasFetch: typeof fetch !== 'undefined' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasFetch).toBe(false);
  });

  it('XMLHttpRequest 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { hasXHR: typeof XMLHttpRequest !== 'undefined' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasXHR).toBe(false);
  });

  it('WebSocket 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { hasWS: typeof WebSocket !== 'undefined' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasWS).toBe(false);
  });

  it('require("axios") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const axios = require('axios');
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('require("http") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const http = require('http');
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('require("https") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const https = require('https');
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('require("net") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const net = require('net');
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('require("node-fetch") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const fetch = require('node-fetch');
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== httpRequest SSRF 防护 =====

  it('httpRequest 禁止访问 127.0.0.1', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('http://127.0.0.1/');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('httpRequest 禁止访问 10.x.x.x', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('http://10.0.0.1/');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('httpRequest 禁止访问 172.16.x.x', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('http://172.16.0.1/');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('httpRequest 禁止访问 192.168.x.x', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('http://192.168.1.1/');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('httpRequest 禁止访问 169.254.169.254 (云元数据)', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('http://169.254.169.254/latest/meta-data/');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('httpRequest 禁止访问 0.0.0.0', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('http://0.0.0.0/');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('httpRequest 禁止 ftp 协议', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('ftp://example.com/file');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('httpRequest 禁止 file 协议', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('file:///etc/passwd');
        return res;
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== httpRequest 正常功能 =====

  it('httpRequest GET 公网地址正常', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('https://httpbin.org/get');
        return { status: res.status };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.status).toBe(200);
  });

  it('httpRequest POST 带 body', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await SystemHelper.httpRequest('https://httpbin.org/post', {
          method: 'POST',
          body: { key: 'value' }
        });
        const data = JSON.parse(res.data);
        return { status: res.status, body: data.json };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.status).toBe(200);
    expect(result.data?.codeReturn.body).toEqual({ key: 'value' });
  });

  it('httpRequest 全局函数 httpRequest 可用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const res = await httpRequest('https://httpbin.org/get');
        return { status: res.status };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.status).toBe(200);
  });
});

describe('网络安全 - Python', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  // ===== 直接网络模块禁止 =====

  it('import urllib 被拦截', async () => {
    const result = await runner.execute({
      code: `import urllib.request
def main():
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import http.client 被拦截', async () => {
    const result = await runner.execute({
      code: `import http.client
def main():
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import socket 被拦截', async () => {
    const result = await runner.execute({
      code: `import socket
def main():
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import requests 被拦截（预检）', async () => {
    const result = await runner.execute({
      code: `import requests
def main():
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== http_request SSRF 防护 =====

  it('http_request 禁止访问 127.0.0.1', async () => {
    const result = await runner.execute({
      code: `def main():
    return system_helper.http_request('http://127.0.0.1/')`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('http_request 禁止访问 10.x.x.x', async () => {
    const result = await runner.execute({
      code: `def main():
    return system_helper.http_request('http://10.0.0.1/')`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('http_request 禁止访问 169.254.169.254 (云元数据)', async () => {
    const result = await runner.execute({
      code: `def main():
    return system_helper.http_request('http://169.254.169.254/latest/meta-data/')`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/private|internal|not allowed/i);
  });

  it('http_request 禁止 file 协议', async () => {
    const result = await runner.execute({
      code: `def main():
    return system_helper.http_request('file:///etc/passwd')`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== http_request 正常功能 =====

  it('http_request GET 公网地址正常', async () => {
    const result = await runner.execute({
      code: `def main():
    res = system_helper.http_request('https://httpbin.org/get')
    return {'status': res['status']}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.status).toBe(200);
  });

  it('http_request POST 带 body', async () => {
    const result = await runner.execute({
      code: `import json
def main():
    res = system_helper.http_request('https://httpbin.org/post', method='POST', body={'key': 'value'})
    data = json.loads(res['data'])
    return {'status': res['status'], 'body': data.get('json')}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.status).toBe(200);
    expect(result.data?.codeReturn.body).toEqual({ key: 'value' });
  });

  it('全局函数 http_request 可用', async () => {
    const result = await runner.execute({
      code: `def main():
    res = http_request('https://httpbin.org/get')
    return {'status': res['status']}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.status).toBe(200);
  });
});
