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

  it.each(['axios', 'ordinary'] as const)(
    'does not emit request secrets or untrusted %s errors through console or OTel',
    async (kind) => {
      consoleRecords.length = 0;
      otelRecords.length = 0;
      let called = false;
      axios.defaults.adapter = (async (config) => {
        called = true;
        const error =
          kind === 'axios'
            ? new AxiosError(`request ${marker}`, 'ECONNRESET', config)
            : Object.assign(new Error(`failure ${marker}`), { code: marker });
        Object.assign(error, {
          cause: new Error(`cause ${marker}`),
          response: { status: kind === 'axios' ? 503 : marker, data: { message: marker } }
        });
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
      expect(result.errorMsg).toBeTruthy();
      expect(consoleRecords).toHaveLength(1);
      expect(otelRecords).toHaveLength(1);
      const allLogs = JSON.stringify({ consoleRecords, otelRecords });
      expect(allLogs).not.toContain(marker);
      expect(allLogs).not.toContain('/echo');
      expect(allLogs).not.toContain('config');
      expect(allLogs).not.toContain('cause');
      expect(allLogs).toContain('HTTP tool request failed');
      if (kind === 'axios') {
        expect(allLogs).toContain('ECONNRESET');
        expect(allLogs).toContain('503');
      } else {
        expect(allLogs).not.toContain('503');
      }
    }
  );
});
