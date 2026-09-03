import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn().mockResolvedValue(undefined)
}));

const runCodeMock = vi.fn();
vi.mock('@fastgpt/service/thirdProvider/codeSandbox', () => ({
  codeSandbox: { runCode: (...args: any[]) => runCodeMock(...args) }
}));

import { runWorkflow } from '@fastgpt/service/core/workflow/dispatch';
import { createToolCallToolProvider } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolProvider';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { formatAgentLoopCoreToolResponse } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner';

const appId = '67e0d5535c02d1d5cdede721';
const teamId = '654a4107c32f3bf5f998452f';
const tmbId = '65ab7007462ada7dbb899948';

const createVariableState = () =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: { id: appId, name: 'app', teamId, tmbId },
    uid: 'test-user',
    chatId: 'chat-1',
    responseChatItemId: 'resp-1',
    histories: [],
    variablesConfig: [],
    inputVariables: {},
    externalVariables: {}
  });

const runNodeAsTool = async (toolNode: RuntimeNodeItemType) => {
  const toolCallNode: RuntimeNodeItemType = {
    nodeId: 'toolCallNode',
    name: 'Agent',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.toolCall,
    showStatus: true,
    isEntry: false,
    catchError: false,
    inputs: [],
    outputs: []
  };
  const runtimeEdges: RuntimeEdgeItemType[] = [
    {
      source: 'toolCallNode',
      target: toolNode.nodeId,
      sourceHandle: 'toolCallNode-source-selectedTools',
      targetHandle: 'selectedTools',
      status: 'active'
    }
  ];

  const result = await runWorkflow({
    apiVersion: 'v2',
    mode: 'chat',
    chatId: 'chat-1',
    responseChatItemId: 'resp-1',
    runningAppInfo: { id: appId, name: 'app', teamId, tmbId },
    runningUserInfo: {
      teamId,
      tmbId,
      teamName: 'team',
      memberName: 'member',
      contact: '',
      username: 'user'
    },
    uid: 'test-user',
    lang: 'zh-CN',
    histories: [],
    query: [],
    variables: {},
    chatConfig: {},
    runtimeNodes: [toolCallNode, toolNode],
    runtimeEdges,
    variableState: await createVariableState(),
    externalProvider: {},
    workflowDispatchDeep: 0,
    maxRunTimes: 20,
    stream: false,
    isToolCall: true,
    workflowStreamResponse: undefined,
    checkIsStopping: () => false
  } as any);

  return result[DispatchNodeResponseKeyEnum.toolResponse];
};

describe('newly connectable nodes as tools', () => {
  it('textEditor tool exposes its text output as toolResponse', async () => {
    const textEditorNode: RuntimeNodeItemType = {
      nodeId: 'textEditorNode',
      name: 'TextEditor',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.textEditor,
      showStatus: true,
      isEntry: true,
      catchError: false,
      inputs: [
        {
          key: NodeInputKeyEnum.textareaInput,
          label: 'text',
          value: 'hello tool',
          renderTypeList: [FlowNodeInputTypeEnum.textarea],
          valueType: 'string' as any
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.text,
          key: NodeOutputKeyEnum.text,
          label: 'text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: 'string' as any
        }
      ]
    };

    const toolResponse = await runNodeAsTool(textEditorNode);
    expect(formatAgentLoopCoreToolResponse(toolResponse)).toBe('hello tool');
  });

  it('returns the error text instead of none when the tool node fails', async () => {
    runCodeMock.mockRejectedValueOnce(new Error('sandbox boom'));

    const codeNode: RuntimeNodeItemType = {
      nodeId: 'codeNode',
      name: 'Code',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.code,
      showStatus: true,
      isEntry: true,
      catchError: false,
      inputs: [
        {
          key: NodeInputKeyEnum.codeType,
          label: 'codeType',
          value: 'js',
          renderTypeList: [FlowNodeInputTypeEnum.select],
          valueType: 'string' as any
        },
        {
          key: NodeInputKeyEnum.code,
          label: 'code',
          value: 'function main(){return {}}',
          renderTypeList: [FlowNodeInputTypeEnum.textarea],
          valueType: 'string' as any
        },
        {
          key: NodeInputKeyEnum.addInputParam,
          label: 'dynamic',
          value: {},
          renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
          valueType: 'dynamic' as any
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.rawResponse,
          key: NodeOutputKeyEnum.rawResponse,
          label: 'raw',
          type: FlowNodeOutputTypeEnum.static,
          valueType: 'dynamic' as any
        }
      ]
    };

    const workflowProps = {
      apiVersion: 'v2',
      mode: 'chat',
      chatId: 'chat-1',
      responseChatItemId: 'resp-1',
      runningAppInfo: { id: appId, name: 'app', teamId, tmbId },
      runningUserInfo: {
        teamId,
        tmbId,
        teamName: 'team',
        memberName: 'member',
        contact: '',
        username: 'user'
      },
      uid: 'test-user',
      lang: 'zh-CN',
      histories: [],
      query: [],
      variables: {},
      chatConfig: {},
      variableState: await createVariableState(),
      externalProvider: {},
      workflowDispatchDeep: 0,
      maxRunTimes: 20,
      stream: false,
      workflowStreamResponse: undefined,
      checkIsStopping: () => false,
      nodeResponseSink: undefined
    } as any;

    const provider = await runWithContext(
      {
        mcpClientMemory: {},
        fileContext: { limits: { maxFileAmount: 20, maxBytesPerFile: 1024 } } as any
      },
      () =>
        createToolCallToolProvider({
          messages: [{ role: 'user' as any, content: 'hello' }],
          toolNodes: [
            {
              nodeId: 'codeNode',
              name: 'Code',
              avatar: '',
              flowNodeType: FlowNodeTypeEnum.code,
              intro: '',
              inputs: codeNode.inputs
            } as any
          ],
          useAgentSandbox: false,
          lang: 'zh-CN' as any,
          workflowProps,
          runtimeNodes: [codeNode],
          runtimeEdges: [],
          cacheToolFlowResponse: vi.fn()
        } as any)
    );

    const result = await provider.executeTool({
      call: {
        id: 'call_code',
        type: 'function',
        function: { name: 'codeNode', arguments: '{}' }
      } as any,
      messages: []
    });

    expect(result.response).not.toBe('none');
    expect(result.response).toContain('sandbox boom');
  });
});
