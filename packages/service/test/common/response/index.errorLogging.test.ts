import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getOpenTelemetrySink } from '@fastgpt-sdk/otel/logger';

vi.hoisted(() => vi.resetModules());
vi.unmock('@fastgpt/service/common/logger');
vi.unmock('@fastgpt/service/common/response');
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ clearCookie: vi.fn() }));
vi.mock('@fastgpt/service/common/profiling', () => ({ markProfileError: vi.fn() }));

import { processError } from '@fastgpt/service/common/response';

/** 真实日志 sink 验证 Axios 凭据与上游回声不会进入 console 或 OTel。 */
describe('processError Axios error logging', () => {
  const marker = 'synthetic-api-response-private-token';
  const consoleRecords: string[] = [];
  const otelRecords: unknown[] = [];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
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
          formatter: getPrettyFormatter({ wordWrap: false, inspectOptions: { depth: 5 } })
        }),
        otel
      },
      loggers: [{ category: [], lowestLevel: 'trace', sinks: ['console', 'otel'] }]
    });
    dispose = logtape.dispose;
  });

  afterAll(async () => {
    await dispose?.();
  });

  it.each([
    { field: 'message', code: 'ERR_BAD_RESPONSE', status: 503, safe: true },
    { field: 'msg', code: marker, status: 999, safe: false }
  ] as const)(
    'keeps $field response semantics while logging only trusted diagnostics',
    ({ field, code, status, safe }) => {
      consoleRecords.length = 0;
      otelRecords.length = 0;
      const config = {
        method: 'get',
        url: `https://upstream.example/private?token=${marker}`,
        headers: new AxiosHeaders({ Authorization: `Bearer ${marker}`, Cookie: marker }),
        data: { password: marker }
      };
      const response = {
        status,
        statusText: marker,
        headers: { 'x-private-response': marker },
        config,
        data: { [field]: marker }
      };
      const error = new AxiosError(marker, code, config, { _header: marker }, response);
      error.name = marker;
      Object.assign(error, { cause: new Error(marker), msg: marker });

      const processed = processError({ error, url: `/api/model/config?token=${marker}` });

      expect(processed).toMatchObject({
        code: 500,
        httpStatus: 500,
        statusText: 'error',
        message: marker,
        shouldClearCookie: false
      });
      expect(error.config).toBe(config);
      expect(error.response).toBe(response);
      expect(error.code).toBe(code);
      expect(error.message).toBe(marker);
      expect(consoleRecords).toHaveLength(1);
      expect(otelRecords).toHaveLength(1);
      // 两个 sink 先统一记录布尔结果，红灯阶段也不会因首个断言失败而漏检另一个 sink。
      expect({
        consoleContainsSecret: JSON.stringify(consoleRecords).includes(marker),
        otelContainsSecret: JSON.stringify(otelRecords).includes(marker)
      }).toEqual({ consoleContainsSecret: false, otelContainsSecret: false });
      for (const records of [consoleRecords, otelRecords]) {
        const log = JSON.stringify(records);
        for (const excluded of [
          'Authorization',
          'Cookie',
          'config',
          'cause',
          'headers',
          'request:',
          'response:',
          '"request":',
          '"response":',
          '/private',
          '?token='
        ]) {
          expect(log).not.toContain(excluded);
        }
        expect(log).toContain('System unexpected error');
        expect(log).toContain('HTTP request failed');
        expect(log).toContain('HttpRequestError');
        if (safe) {
          expect(log).toContain(code);
          expect(log).toContain('503');
        } else {
          expect(log).not.toContain('999');
        }
      }
    }
  );
});
