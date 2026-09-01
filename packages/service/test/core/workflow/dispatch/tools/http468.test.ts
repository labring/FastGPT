import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  ContentTypes,
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

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

import {
  dispatchHttp468Request,
  filterHttpRuntimeParams
} from '@fastgpt/service/core/workflow/dispatch/tools/http468';

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
      inputs: [],
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

describe('filterHttpRuntimeParams', () => {
  it('removes deprecated containers and invalid references while preserving usable params', () => {
    const node = {
      inputs: [
        {
          key: 'validReference',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['source', 'value'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'missingSource',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['missing', 'value'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'missingOutput',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['source', 'missing'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'invalidOutput',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['source', 'invalid'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'mixedReferences',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: [
            ['source', 'value'],
            ['missing', 'value']
          ],
          valueType: WorkflowIOValueTypeEnum.arrayString
        },
        {
          key: 'emptyReference',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: [['missing', 'value']],
          valueType: WorkflowIOValueTypeEnum.arrayString
        },
        {
          key: 'uncaughtError',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['source', 'error'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'caughtError',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['caught-source', 'error'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'agentParam',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    } as any;
    const sourceNode = {
      nodeId: 'source',
      outputs: [
        {
          id: 'value',
          key: 'value',
          type: FlowNodeOutputTypeEnum.static,
          value: 'source value',
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          id: 'invalid',
          key: 'invalid',
          type: FlowNodeOutputTypeEnum.static,
          value: 'should not be sent',
          invalid: true,
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          id: 'error',
          key: 'error',
          type: FlowNodeOutputTypeEnum.error,
          value: 'uncaught error',
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    } as any;
    const caughtSourceNode = {
      nodeId: 'caught-source',
      catchError: true,
      outputs: [
        {
          id: 'error',
          key: 'error',
          type: FlowNodeOutputTypeEnum.error,
          value: 'caught error',
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    } as any;

    const result = filterHttpRuntimeParams({
      params: {
        [NodeInputKeyEnum.addInputParam]: { legacy: 'value' },
        validReference: 'source value',
        missingSource: ['missing', 'value'],
        missingOutput: undefined,
        invalidOutput: 'should not be sent',
        mixedReferences: ['source value', ['missing', 'value']],
        emptyReference: [],
        uncaughtError: 'uncaught error',
        caughtError: 'caught error',
        agentParam: 'generated value',
        ordinaryParam: ''
      },
      node,
      runtimeNodesMap: new Map([
        ['source', sourceNode],
        ['caught-source', caughtSourceNode]
      ]),
      variables: { [VARIABLE_NODE_ID]: 'unused', existing: 'global value' }
    });

    expect(result).toEqual({
      validReference: 'source value',
      mixedReferences: ['source value'],
      caughtError: 'caught error',
      agentParam: 'generated value',
      ordinaryParam: ''
    });
  });

  it('keeps valid global references and removes missing global values', () => {
    const node = {
      inputs: [
        {
          key: 'validGlobal',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: [VARIABLE_NODE_ID, 'existing'],
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'missingGlobal',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: [VARIABLE_NODE_ID, 'missing'],
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    } as any;

    expect(
      filterHttpRuntimeParams({
        params: { validGlobal: 'global value', missingGlobal: undefined },
        node,
        runtimeNodesMap: new Map(),
        variables: { existing: 'global value' }
      })
    ).toEqual({ validGlobal: 'global value' });
  });
});
