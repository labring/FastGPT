import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ContentTypes, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const axiosMock = vi.hoisted(() => vi.fn());
const isInternalAddressMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: axiosMock
}));

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

  it.each([ContentTypes.formData, ContentTypes.xWwwFormUrlencoded])(
    'silently skips empty keys for %s requests',
    async (httpContentType) => {
      await dispatchHttp468Request(buildProps(httpContentType));

      const request = axiosMock.mock.calls[0][0];
      expect(request.headers).toMatchObject({ 'X-Valid': 'header' });
      expect(Object.keys(request.headers)).not.toContain('');
      expect(request.params).toEqual({ validParam: 'param' });
      expect(Object.fromEntries(request.data)).toEqual({ validField: 'field' });
    }
  );
});
