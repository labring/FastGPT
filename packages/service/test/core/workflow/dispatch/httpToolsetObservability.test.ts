import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';
import { ServerConfigError, UserConfigError } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const otelMocks = vi.hoisted(() => {
  const runDurationRecord = vi.fn();
  const runCountAdd = vi.fn();
  const runActiveAdd = vi.fn();
  const runTimesRecord = vi.fn();
  const stepDurationRecord = vi.fn();
  const stepCountAdd = vi.fn();

  const spanRecordException = vi.fn();
  const spanSetStatus = vi.fn();
  const spanEnd = vi.fn();

  const getMeter = vi.fn(() => ({
    createHistogram: vi.fn((name: string) => {
      if (name === 'fastgpt.workflow.run.duration') return { record: runDurationRecord };
      if (name === 'fastgpt.workflow.run.run_times') return { record: runTimesRecord };
      return { record: stepDurationRecord };
    }),
    createCounter: vi.fn((name: string) => {
      if (name === 'fastgpt.workflow.run.count') return { add: runCountAdd };
      return { add: stepCountAdd };
    }),
    createUpDownCounter: vi.fn(() => ({ add: runActiveAdd }))
  }));

  const getTracer = vi.fn(() => ({
    startActiveSpan: vi.fn((_name: string, _opts: unknown, fn: (span: any) => Promise<unknown>) =>
      fn({
        setAttribute: vi.fn(),
        setStatus: spanSetStatus,
        recordException: spanRecordException,
        addEvent: vi.fn(),
        end: spanEnd
      })
    )
  }));

  return {
    getMeter,
    getTracer,
    runDurationRecord,
    runCountAdd,
    runActiveAdd,
    spanRecordException,
    spanSetStatus,
    spanEnd,
    getHttpSchema: vi.fn(),
    checkUrlSafety: vi.fn()
  };
});

vi.mock('@fastgpt-sdk/otel/metrics', () => ({
  configureMetricsFromEnv: vi.fn(),
  disposeMetrics: vi.fn(),
  getMeter: otelMocks.getMeter
}));

vi.mock('@fastgpt-sdk/otel/tracing', () => ({
  configureTracing: vi.fn(),
  createTracingOptionsFromEnv: vi.fn(),
  disposeTracing: vi.fn(),
  getCurrentSpanContext: vi.fn(),
  getTracer: otelMocks.getTracer,
  addSpanProcessor: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  actual.axios.get = otelMocks.getHttpSchema;
  return actual;
});

vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/utils')>()),
  checkUrlSafety: otelMocks.checkUrlSafety
}));

// 准备阶段抛出前不会进入节点回调映射，避免拉起无关的本地未链接沙箱 SDK。
vi.mock('@fastgpt/service/core/workflow/dispatch/constants', () => ({
  callbackMap: {}
}));

import { runGraph } from './testUtils/workflowGraph';

const createInlineHttpToolSetNode = (apiSchemaUrl = 'https://api.example.com/openapi.json') => ({
  nodeId: 'http-set',
  name: 'Inline HTTP Toolset',
  avatar: '',
  flowNodeType: FlowNodeTypeEnum.toolSet,
  inputs: [],
  outputs: [],
  toolConfig: {
    httpToolSet: {
      apiSchemaUrl,
      toolList: []
    }
  }
});

describe('runWorkflow HTTP toolset preparation observability', () => {
  beforeEach(() => {
    otelMocks.runDurationRecord.mockClear();
    otelMocks.runCountAdd.mockClear();
    otelMocks.runActiveAdd.mockClear();
    otelMocks.spanRecordException.mockClear();
    otelMocks.spanSetStatus.mockClear();
    otelMocks.spanEnd.mockClear();
    otelMocks.getHttpSchema.mockReset();
    otelMocks.checkUrlSafety.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    {
      label: 'missing apiSchemaUrl',
      apiSchemaUrl: '',
      setup: () => {}
    },
    {
      label: 'remote schema fetch failure',
      apiSchemaUrl: 'https://api.example.com/openapi.json',
      setup: () => {
        otelMocks.getHttpSchema.mockRejectedValue(new Error('Request failed with status code 404'));
      }
    },
    {
      label: 'non-OpenAPI JSON payload',
      apiSchemaUrl: 'https://api.example.com/openapi.json',
      setup: () => {
        otelMocks.getHttpSchema.mockResolvedValue({
          data: JSON.stringify({ code: 200, data: {} })
        });
      }
    },
    {
      label: 'OpenAPI document with null paths',
      apiSchemaUrl: 'https://api.example.com/openapi.json',
      setup: () => {
        otelMocks.getHttpSchema.mockResolvedValue({
          data: JSON.stringify({
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0.0' },
            paths: null
          })
        });
      }
    }
  ])(
    'records user_error metric and avoids ERROR span when preparation fails due to $label',
    async ({ apiSchemaUrl, setup }) => {
      setup();

      await expect(
        runGraph({
          nodes: [createInlineHttpToolSetNode(apiSchemaUrl)]
        })
      ).rejects.toBeInstanceOf(UserConfigError);

      expect(otelMocks.runCountAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'user_error' })
      );
      expect(otelMocks.runDurationRecord).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ status: 'user_error' })
      );
      expect(otelMocks.runCountAdd).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'error' })
      );
      expect(otelMocks.spanRecordException).not.toHaveBeenCalled();
      expect(otelMocks.spanSetStatus).not.toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR })
      );
      expect(otelMocks.spanEnd).toHaveBeenCalledTimes(1);
    }
  );

  it('records error metric and ERROR span when preparation hits ServerConfigError', async () => {
    const proxyError = new ServerConfigError('Invalid outbound proxy URL configuration');
    otelMocks.getHttpSchema.mockRejectedValue(proxyError);

    await expect(
      runGraph({
        nodes: [createInlineHttpToolSetNode()]
      })
    ).rejects.toBe(proxyError);

    expect(otelMocks.runCountAdd).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'error' })
    );
    expect(otelMocks.runDurationRecord).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ status: 'error' })
    );
    expect(otelMocks.spanRecordException).toHaveBeenCalledWith(proxyError);
    expect(otelMocks.spanSetStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: proxyError.message
    });
    expect(otelMocks.spanEnd).toHaveBeenCalledTimes(1);
  });
});
