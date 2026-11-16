import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AxiosError, type AxiosAdapter } from 'axios';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getOpenTelemetrySink } from '@fastgpt-sdk/otel/logger';

// 官方 setup 会预加载并 mock logger；这里重新加载真实模块和真实 sink。
vi.hoisted(() => vi.resetModules());
vi.unmock('@fastgpt/service/common/logger');

import { axios } from '@fastgpt/service/common/api/axios';
import { formatHttpError } from '@fastgpt/service/common/api/httpError';
import { runHTTPTool } from '@fastgpt/service/core/app/http';

describe('runHTTPTool error logging', () => {
  const marker = 'synthetic-http-tool-private-token';
  const consoleRecords: string[] = [];
  const otelRecords: unknown[] = [];
  const originalAdapter = axios.defaults.adapter;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    // SDK 自身使用的同一 LogTape 模块；不启动 exporter 或真实网络。
    const sdkRequire = createRequire(resolve(process.cwd(), '../../sdk/otel/package.json'));
    const logtapePath = sdkRequire.resolve('@logtape/logtape').replace(/\.cjs$/, '.js');
    const prettyPath = sdkRequire.resolve('@logtape/pretty').replace(/\.cjs$/, '.js');
    const logtape = await import(pathToFileURL(logtapePath).href);
    const { getPrettyFormatter } = await import(pathToFileURL(prettyPath).href);
    const captureConsole = {
      log: (...parts: unknown[]) => consoleRecords.push(parts.map(String).join(' ')),
      debug: (...parts: unknown[]) => consoleRecords.push(parts.map(String).join(' ')),
      info: (...parts: unknown[]) => consoleRecords.push(parts.map(String).join(' ')),
      warn: (...parts: unknown[]) => consoleRecords.push(parts.map(String).join(' ')),
      error: (...parts: unknown[]) => consoleRecords.push(parts.map(String).join(' '))
    };
    const otel = getOpenTelemetrySink({
      loggerProvider: { getLogger: () => ({ emit: (record: unknown) => otelRecords.push(record) }) }
    });
    await logtape.configure({
      sinks: {
        console: logtape.getConsoleSink({
          console: captureConsole,
          formatter: getPrettyFormatter({ inspectOptions: { depth: 5 } })
        }),
        otel
      },
      loggers: [{ category: [], lowestLevel: 'trace', sinks: ['console', 'otel'] }]
    });
    dispose = logtape.dispose;
  });

  afterAll(async () => {
    axios.defaults.adapter = originalAdapter;
    await dispose?.();
  });

  it.each(['axios', 'ordinary', 'direct-only', 'invalid-response'] as const)(
    'does not emit request secrets or untrusted %s errors through console or OTel',
    async (kind) => {
      consoleRecords.length = 0;
      otelRecords.length = 0;
      let called = false;
      let interceptorApplied = false;
      let secretHeaderPresent = false;
      let rejectedError: unknown;
      axios.defaults.adapter = (async (config) => {
        called = true;
        interceptorApplied = config.maxRedirects === 0 && '__safeRedirect' in config;
        secretHeaderPresent = config.headers.Authorization === marker;
        const error =
          kind === 'ordinary'
            ? Object.assign(new Error(`failure ${marker}`), { code: marker })
            : new AxiosError(`request ${marker}`, 'ECONNRESET', config);
        Object.assign(error, {
          cause: new Error(`cause ${marker}`),
          ...(kind !== 'direct-only'
            ? { response: { status: kind === 'axios' ? 503 : 999, data: { message: marker } } }
            : {}),
          ...(kind === 'direct-only' || kind === 'invalid-response' ? { status: 418 } : {})
        });
        rejectedError = error;
        throw error;
      }) satisfies AxiosAdapter;

      const result = await runHTTPTool({
        baseUrl: 'http://8.8.8.8',
        toolPath: `/echo?token=${marker}`,
        method: 'GET',
        params: {},
        headerSecret: { Authorization: { value: marker } }
      });

      expect(called).toBe(true);
      expect(interceptorApplied).toBe(true);
      expect(secretHeaderPresent).toBe(true);
      expect(result.errorMsg).toBe(formatHttpError(rejectedError).rawText);
      expect(consoleRecords).toHaveLength(1);
      expect(otelRecords).toHaveLength(1);
      const allLogs = JSON.stringify({ consoleRecords, otelRecords });
      expect(allLogs).not.toContain(marker);
      expect(allLogs).not.toContain('/echo');
      expect(allLogs).not.toContain('config');
      expect(allLogs).not.toContain('cause');
      expect(allLogs).toContain('HTTP tool request failed');
      expect(allLogs).toContain('HttpToolRequestError');
      expect(otelRecords[0]).toMatchObject({
        severityText: 'warning',
        body: { name: 'HttpToolRequestError', message: 'HTTP tool request failed' }
      });
      if (kind === 'ordinary') expect(otelRecords[0]).not.toHaveProperty('body.code');
      else expect(otelRecords[0]).toHaveProperty('body.code', 'ECONNRESET');
      if (kind === 'axios') {
        expect(otelRecords[0]).toHaveProperty('body.status', 503);
      } else {
        expect(otelRecords[0]).not.toHaveProperty('body.status');
        expect(JSON.stringify(consoleRecords)).not.toMatch(/\bstatus\s*:/);
      }
    }
  );
});
