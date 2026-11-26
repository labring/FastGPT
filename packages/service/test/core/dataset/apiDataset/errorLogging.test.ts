import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import axiosLibrary, { AxiosError, type AxiosAdapter } from 'axios';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getOpenTelemetrySink } from '@fastgpt-sdk/otel/logger';

vi.hoisted(() => vi.resetModules());
vi.unmock('@fastgpt/service/common/logger');
vi.unmock('@fastgpt/service/common/api/axios');

import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { useFeishuDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/feishuDataset/api';
import { useYuqueDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api';

/** 保留真实 Axios 拦截器与 console/OTel sink，只在网络适配层注入合成鉴权失败。 */
describe('API dataset authentication error logging', () => {
  const marker = 'synthetic-source-provider-private-token';
  const consoleRecords: string[] = [];
  const otelRecords: unknown[] = [];
  const originalAdapter = axiosLibrary.defaults.adapter;
  const originalTokenAdapter = axiosWithoutSSRF.defaults.adapter;
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

  afterEach(() => {
    axiosLibrary.defaults.adapter = originalAdapter;
    axiosWithoutSSRF.defaults.adapter = originalTokenAdapter;
  });

  it.each(['feishu', 'yuque'] as const)(
    '%s keeps the original rejection without logging credentials',
    async (provider) => {
      consoleRecords.length = 0;
      otelRecords.length = 0;
      let failure: AxiosError | undefined;
      let secretWasInRequest = false;
      let adapterCalls = 0;
      const adapter: AxiosAdapter = async (config) => {
        adapterCalls++;
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        secretWasInRequest =
          provider === 'feishu'
            ? body?.app_secret === marker
            : config.headers.get('X-Auth-Token') === marker;
        failure = new AxiosError(
          marker,
          'ERR_BAD_REQUEST',
          config,
          { _header: marker },
          {
            config,
            status: 401,
            statusText: marker,
            headers: { 'x-private-response': marker },
            data: { message: marker, msg: marker }
          }
        );
        Object.assign(failure, { cause: new Error(marker) });
        throw failure;
      };
      axiosLibrary.defaults.adapter = adapter;
      axiosWithoutSSRF.defaults.adapter = adapter;

      const api =
        provider === 'feishu'
          ? useFeishuDatasetRequest({
              feishuServer: {
                appId: 'synthetic-app',
                appSecret: marker,
                folderToken: 'synthetic-folder'
              }
            })
          : useYuqueDatasetRequest({ yuqueServer: { userId: 'synthetic-group', token: marker } });
      const rejected = await api.listFiles({}).catch((error) => error);

      expect(adapterCalls).toBe(1);
      expect(secretWasInRequest).toBe(true);
      expect(failure).toBeInstanceOf(AxiosError);
      expect(rejected).toBe(failure);
      expect(consoleRecords).toHaveLength(1);
      expect(otelRecords).toHaveLength(1);
      expect({
        consoleContainsSecret: JSON.stringify(consoleRecords).includes(marker),
        otelContainsSecret: JSON.stringify(otelRecords).includes(marker)
      }).toEqual({ consoleContainsSecret: false, otelContainsSecret: false });
      for (const records of [consoleRecords, otelRecords]) {
        const log = JSON.stringify(records);
        for (const excluded of [
          'app_secret',
          'X-Auth-Token',
          'config',
          'cause',
          'headers',
          'request:',
          'response:',
          '"request":',
          '"response":',
          '?token='
        ]) {
          expect(log).not.toContain(excluded);
        }
        expect(log).toContain(
          provider === 'feishu' ? 'Feishu dataset request failed' : 'Yuque dataset request failed'
        );
        expect(log).toContain('HttpRequestError');
        expect(log).toContain('HTTP request failed');
        expect(log).toContain('ERR_BAD_REQUEST');
        expect(log).toContain('401');
      }
    }
  );
});
