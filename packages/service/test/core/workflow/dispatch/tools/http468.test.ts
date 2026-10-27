import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  ContentTypes,
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const axiosMock = vi.hoisted(() => vi.fn());
const isInternalAddressMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: axiosMock
  };
});

vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/system/utils')>();
  return {
    ...mod,
    isInternalAddress: isInternalAddressMock
  };
});

import { dispatchHttp468Request } from '@fastgpt/service/core/workflow/dispatch/tools/http468';

const buildProps = (httpContentType: ContentTypes) =>
  ({
    runningAppInfo: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    },
    chatId: 'chat-1',
    responseChatItemId: 'response-1',
    variableState: {
      toRuntimeRecord: () => ({ emptyKey: '' })
    },
    node: {
      outputs: []
    },
    runtimeNodesMap: new Map(),
    histories: [],
    params: {
      [NodeInputKeyEnum.httpReqUrl]: 'https://example.com',
      [NodeInputKeyEnum.httpMethod]: 'POST',
      [NodeInputKeyEnum.httpHeaders]: [
        { key: 'X-Valid', type: 'string', value: 'header' },
        { key: '', type: 'string', value: 'empty' },
        { key: '{{emptyKey}}', type: 'string', value: 'replaced-empty' }
      ],
      [NodeInputKeyEnum.httpParams]: [
        { key: 'validParam', type: 'string', value: 'param' },
        { key: '', type: 'string', value: 'empty' },
        { key: '{{emptyKey}}', type: 'string', value: 'replaced-empty' }
      ],
      [NodeInputKeyEnum.httpFormBody]: [
        { key: 'validField', type: 'string', value: 'field' },
        { key: '', type: 'string', value: 'empty' },
        { key: '{{emptyKey}}', type: 'string', value: 'replaced-empty' }
      ],
      [NodeInputKeyEnum.httpContentType]: httpContentType,
      [NodeInputKeyEnum.httpJsonBody]: ''
    }
  }) as any;

describe('dispatchHttp468Request empty keys', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    axiosMock.mockResolvedValue({ data: {} });
    isInternalAddressMock.mockReset();
    isInternalAddressMock.mockResolvedValue(false);
  });

  it.each(
    [ContentTypes.formData, ContentTypes.xWwwFormUrlencoded].flatMap((httpContentType) =>
      [true, false].map((hasType) => ({ httpContentType, hasType }))
    )
  )(
    'sends persisted $httpContentType entries and skips empty keys (type saved: $hasType)',
    async ({ httpContentType, hasType }) => {
      const props = buildProps(httpContentType);
      for (const key of [
        NodeInputKeyEnum.httpHeaders,
        NodeInputKeyEnum.httpParams,
        NodeInputKeyEnum.httpFormBody
      ]) {
        if (!hasType)
          props.params[key] = props.params[key].map(
            ({ key, value }: { key: string; value: string }) => ({ key, value })
          );
      }
      props.params = JSON.parse(JSON.stringify(props.params));
      const before = structuredClone(props.params);
      await dispatchHttp468Request(props);

      const request = axiosMock.mock.calls[0][0];
      expect(request.headers).toMatchObject({ 'X-Valid': 'header' });
      expect(Object.keys(request.headers)).not.toContain('');
      expect(request.params).toEqual({ validParam: 'param' });
      expect(Object.fromEntries(request.data)).toEqual({ validField: 'field' });
      expect(props.params).toEqual(before);
    }
  );
});

describe('dispatchHttp468Request error body', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    isInternalAddressMock.mockReset();
    isInternalAddressMock.mockResolvedValue(false);
  });

  const rejectWith = (error: unknown) => {
    axiosMock.mockRejectedValue(error);
    return dispatchHttp468Request(buildProps(ContentTypes.json));
  };

  it('surfaces a non-message JSON body in the node error text', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      status: 400,
      config: { method: 'post' },
      response: {
        status: 400,
        data: { detail: 'sku missing' }
      }
    });

    const result = await rejectWith(axiosError);
    const errorText = result[DispatchNodeResponseKeyEnum.nodeResponse]?.errorText;

    expect(errorText).toContain('Request failed with status code 400');
    expect(errorText).toContain('sku missing');
    expect(errorText).toContain(JSON.stringify({ detail: 'sku missing' }));
    expect(result.error?.[NodeOutputKeyEnum.error]).toBe(errorText);
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]?.error).toBe(errorText);
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]).toEqual({
      message: 'Request failed with status code 400',
      data: { detail: 'sku missing' },
      name: 'AxiosError',
      method: 'post',
      code: 'ERR_BAD_REQUEST',
      status: 400
    });
  });

  it('does not append the body again when the error text already contains it', async () => {
    const axiosError = Object.assign(
      new Error('Request failed with status code 400: sku missing'),
      {
        response: { data: 'sku missing' }
      }
    );

    const result = await rejectWith(axiosError);
    const errorText = result[DispatchNodeResponseKeyEnum.nodeResponse]?.errorText;

    expect(errorText).toBe('Request failed with status code 400: sku missing');
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]?.data).toBe('sku missing');
  });

  it('shares sanitized text across error outputs without losing fields after a URL', async () => {
    const data = {
      url: 'https://api.example.com/resource',
      detail: 'sku missing ns-demo-secret'
    };
    const result = await rejectWith(
      Object.assign(new Error('Request failed with status code 400'), {
        response: { data }
      })
    );
    const errorText =
      'Request failed with status code 400\n{"url":"https://xxx","detail":"sku missing xxx"}';

    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.errorText).toBe(errorText);
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe(errorText);
    expect(result.error?.[NodeOutputKeyEnum.error]).toBe(errorText);
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]?.error).toBe(errorText);
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]?.data).toEqual(data);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.httpErrorResult?.data).toEqual(data);
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]).not.toHaveProperty('rawText');
  });

  it('caps a huge response body in the node error text', async () => {
    const detail = 'x'.repeat(2500);
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { detail } }
    });

    const result = await rejectWith(axiosError);
    const errorText = result[DispatchNodeResponseKeyEnum.nodeResponse]?.errorText ?? '';
    const bodyStart = errorText.indexOf('\n');
    const snippet = bodyStart >= 0 ? errorText.slice(bodyStart + 1) : errorText;

    expect(errorText).toContain('Request failed with status code 400');
    expect(snippet.startsWith('{"detail":"xxx')).toBe(true);
    expect(snippet.endsWith('...')).toBe(true);
    expect(snippet.length).toBe(2003);
    expect(errorText).not.toContain(detail);
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]?.data).toEqual({ detail });
  });
});
