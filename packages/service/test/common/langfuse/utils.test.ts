import { describe, expect, it } from 'vitest';
import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getLangfuseStepStartAttributes,
  getLangfuseTraceAttributes,
  getLangfuseTraceOutput,
  langfuseTraceOutputAllowedKeys,
  serializeLangfuseTraceOutput,
  serializeLangfuseValue
} from '@fastgpt/service/common/langfuse/utils';

const buildToolItem = (
  overrides: Partial<ToolModuleResponseItemType> = {}
): ToolModuleResponseItemType => ({
  id: 'tool-1',
  toolName: 'get_weather',
  toolAvatar: 'core/app/type/plugin',
  params: '{"city":"北京"}',
  response: '晴',
  functionName: 'get_weather',
  ...overrides
});

describe('getLangfuseTraceOutput', () => {
  it('merges consecutive pure text and reasoning items like 1.5.0', () => {
    expect(
      getLangfuseTraceOutput([
        { reasoning: { content: 'think-1' } },
        { reasoning: { content: 'think-2' } },
        { text: { content: 'answer-1' } },
        { text: { content: 'answer-2' } }
      ])
    ).toEqual([
      { reasoning: { content: 'think-1think-2' } },
      { text: { content: 'answer-1answer-2' } }
    ]);
  });

  it('keeps boundaries of items that carry tools or interactive fields', () => {
    const tool = buildToolItem();
    const items: AIChatItemValueItemType[] = [
      { text: { content: 'before' } },
      { text: { content: 'with-tool' }, tools: [tool] },
      { text: { content: 'after' } }
    ];

    expect(getLangfuseTraceOutput(items)).toEqual(items);
  });

  it('does not merge text into a previous reasoning item', () => {
    const items: AIChatItemValueItemType[] = [
      { reasoning: { content: 'think' } },
      { text: { content: 'answer' } }
    ];

    expect(getLangfuseTraceOutput(items)).toEqual(items);
  });

  it('does not mutate the caller items', () => {
    const values: AIChatItemValueItemType[] = [
      { text: { content: 'A' } },
      { text: { content: 'B' } }
    ];
    getLangfuseTraceOutput(values);
    expect(values[0].text?.content).toBe('A');
    expect(values[1].text?.content).toBe('B');
  });

  it('falls back to an empty text item when output is empty', () => {
    expect(getLangfuseTraceOutput([])).toEqual([{ text: { content: '' } }]);
  });
});

describe('serializeLangfuseTraceOutput', () => {
  it('drops input context, recovery state and internal fields', () => {
    const item: AIChatItemValueItemType = {
      inputContext: { content: 'full rewritten user input' },
      contextCheckpoint: 'checkpoint-snapshot',
      userMessage: { content: 'hidden instruction', source: 'server' },
      toolResponses: [{ id: 'tool-1', response: 'private' }],
      text: { content: 'answer' }
    };

    expect(JSON.parse(serializeLangfuseTraceOutput([item]))).toEqual([
      { text: { content: 'answer' } }
    ]);
  });

  it('drops interactive resume snapshots and keeps only structural metadata', () => {
    const interactive: WorkflowInteractiveResponseType = {
      type: 'userInput',
      entryNodeIds: ['workflowStartNodeId'],
      memoryEdges: [],
      nodeOutputs: [
        {
          nodeId: 'workflowStartNodeId',
          key: NodeOutputKeyEnum.userChatInput,
          value: 'full user input'
        }
      ],
      params: {
        description: '请补充信息',
        inputForm: []
      }
    };

    const serialized = serializeLangfuseTraceOutput([{ interactive }]);

    expect(JSON.parse(serialized)).toEqual([
      {
        interactive: {
          type: 'userInput',
          params: { inputForm: [] }
        }
      }
    ]);
    // 说明可经编辑器变量展开携带用户输入，不上报。
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('请补充信息');
  });

  it('drops variable-expanded descriptions for userSelect', () => {
    const interactive: WorkflowInteractiveResponseType = {
      type: 'userSelect',
      entryNodeIds: ['userSelectNodeId'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        // 运行态说明由编辑器变量展开，可携带工作流开始节点的完整用户输入。
        description: '请确认：帮我查一下内部的机密项目进度',
        userSelectOptions: [
          { key: 'confirm', value: '帮我查一下内部的机密项目进度' },
          { key: 'cancel', value: '取消' }
        ]
      }
    };

    const serialized = serializeLangfuseTraceOutput([{ interactive }]);

    expect(JSON.parse(serialized)).toEqual([
      {
        interactive: {
          type: 'userSelect',
          params: {}
        }
      }
    ]);
    expect(serialized).not.toContain('机密项目');
    expect(serialized).not.toContain('userSelectOptions');
    expect(serialized).not.toContain('description');
  });

  it('drops loop continuation snapshots and keeps only the final display interactive', () => {
    const interactive: WorkflowInteractiveResponseType = {
      type: 'loopRunInteractive',
      entryNodeIds: ['loopRunNodeId'],
      memoryEdges: [],
      nodeOutputs: [
        {
          nodeId: 'loopRunNodeId',
          key: NodeOutputKeyEnum.userChatInput,
          value: 'internal resume input'
        }
      ],
      params: {
        // 前序轮次快照：包含上游用户输入与各轮原始 customOutputs，不得进入 trace。
        loopHistory: [
          {
            iteration: 0,
            success: true,
            customOutputs: {
              [NodeOutputKeyEnum.userChatInput]: '上一轮用户输入',
              answer: '上一轮模型回复'
            }
          }
        ],
        childrenResponse: {
          type: 'userSelect',
          entryNodeIds: ['userSelectNodeId'],
          memoryEdges: [],
          nodeOutputs: [
            {
              nodeId: 'userSelectNodeId',
              key: NodeOutputKeyEnum.userChatInput,
              value: 'internal select input'
            }
          ],
          params: {
            description: '请选择下一步操作',
            userSelectOptions: [
              { key: 'optionA', value: 'A' },
              { key: 'optionB', value: 'B' }
            ]
          }
        },
        iteration: 1,
        pendingIterationSummary: { internal: 'state' }
      }
    };

    const serialized = serializeLangfuseTraceOutput([{ interactive }]);

    // 动态选项可引用上游文本，仅保留交互类型，说明与选项值不上报。
    expect(JSON.parse(serialized)).toEqual([
      {
        interactive: {
          type: 'userSelect',
          params: {}
        }
      }
    ]);
    // 脱敏不变量：续跑快照、上游用户输入、说明、选项值与调度状态不得出现在序列化结果中。
    expect(serialized).not.toContain('loopHistory');
    expect(serialized).not.toContain('上一轮用户输入');
    expect(serialized).not.toContain('customOutputs');
    expect(serialized).not.toContain('pendingIterationSummary');
    expect(serialized).not.toContain('entryNodeIds');
    expect(serialized).not.toContain('nodeOutputs');
    expect(serialized).not.toContain('userSelectOptions');
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('请选择下一步操作');
    expect(serialized).not.toContain('optionA');
  });

  it('drops loopResult snapshots for loopInteractive and keeps only the leaf params', () => {
    const interactive: WorkflowInteractiveResponseType = {
      type: 'loopInteractive',
      entryNodeIds: ['loopNodeId'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        loopResult: [{ answer: '上一轮模型回复' }],
        childrenResponse: {
          type: 'userInput',
          entryNodeIds: ['formNodeId'],
          memoryEdges: [],
          nodeOutputs: [],
          params: {
            description: '请补充表单',
            inputForm: [
              {
                key: 'name',
                label: '姓名',
                type: FlowNodeInputTypeEnum.input,
                valueType: WorkflowIOValueTypeEnum.string,
                required: true
              }
            ],
            submitted: false
          }
        },
        currentIndex: 1
      }
    };

    expect(JSON.parse(serializeLangfuseTraceOutput([{ interactive }]))).toEqual([
      {
        interactive: {
          type: 'userInput',
          params: {
            // 表单只保留结构元数据：字段名/类型/必填；说明、标签、valueType 与 submitted 不上报。
            inputForm: [
              {
                key: 'name',
                type: FlowNodeInputTypeEnum.input,
                required: true
              }
            ]
          }
        }
      }
    ]);
  });

  it('drops agentAsk tool arguments and keeps only the tool call id', () => {
    const interactive: WorkflowInteractiveResponseType = {
      type: 'agentAsk',
      entryNodeIds: ['agentNodeId'],
      memoryEdges: [],
      nodeOutputs: [
        {
          nodeId: 'agentNodeId',
          key: NodeOutputKeyEnum.userChatInput,
          value: '上游用户输入'
        }
      ],
      params: {
        toolCallId: 'call-1',
        // 模型原始工具参数可携带会话上下文，不得进入 trace。
        arguments: JSON.stringify({
          reason: '需要用户补充信息',
          blockerType: 'missing_required_input',
          question: '请确认目标城市',
          options: ['北京', '上海']
        })
      }
    };

    const serialized = serializeLangfuseTraceOutput([{ interactive }]);

    expect(JSON.parse(serialized)).toEqual([
      {
        interactive: {
          type: 'agentAsk',
          params: { toolCallId: 'call-1' }
        }
      }
    ]);
    expect(serialized).not.toContain('arguments');
    expect(serialized).not.toContain('目标城市');
  });

  it('projects tool records to identifiers and drops params and responses', () => {
    const item: AIChatItemValueItemType = {
      tools: [
        buildToolItem({
          id: 'tool-1',
          // 内置读文件工具的参数可携带上传文件的完整签名 URL（含访问凭证）。
          params: '{"fileUrl":"https://oss.example.com/file?signature=SECRET"}',
          response: '文件内容全文',
          content: [{ type: 'text', text: '结构化文件内容' }]
        })
      ]
    };

    const serialized = serializeLangfuseTraceOutput([item]);

    expect(JSON.parse(serialized)).toEqual([
      {
        tools: [{ id: 'tool-1', toolName: 'get_weather', functionName: 'get_weather' }]
      }
    ]);
    expect(serialized).not.toContain('fileUrl');
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('文件内容');
    expect(serialized).not.toContain('params');
    expect(serialized).not.toContain('response');
  });

  it('projects the deprecated tool marker to identifiers only', () => {
    const item: AIChatItemValueItemType = {
      tool: buildToolItem({ params: '{"fileUrl":"https://oss.example.com/file?signature=SECRET"}' })
    };

    const serialized = serializeLangfuseTraceOutput([item]);

    expect(JSON.parse(serialized)).toEqual([
      {
        tool: { id: 'tool-1', toolName: 'get_weather', functionName: 'get_weather' }
      }
    ]);
    expect(serialized).not.toContain('SECRET');
  });

  it('keeps recent complete items when the count exceeds the array limit', () => {
    const tool = buildToolItem();
    const items: AIChatItemValueItemType[] = Array.from({ length: 120 }, (_, index) =>
      index === 119 ? { text: { content: 'final-answer' } } : { tools: [tool] }
    );

    const parsed = JSON.parse(serializeLangfuseTraceOutput(items));

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeLessThanOrEqual(100);
    expect(
      parsed.every((item: unknown) => !!item && typeof item === 'object' && !Array.isArray(item))
    ).toBe(true);
    expect(parsed[parsed.length - 1]).toEqual({ text: { content: 'final-answer' } });
  });

  it('keeps a JSON object array when the serialized output exceeds the size limit', () => {
    const items: AIChatItemValueItemType[] = Array.from({ length: 12 }, (_, index) => ({
      tools: [buildToolItem({ id: `tool-${index}`, response: 'x'.repeat(10000) })]
    }));

    const serialized = serializeLangfuseTraceOutput(items);
    const parsed = JSON.parse(serialized);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.every((item: unknown) => !!item && typeof item === 'object')).toBe(true);
    expect(serialized.length).toBeLessThanOrEqual(100000);
  });

  it('keeps an empty output as an array with an empty text item', () => {
    expect(JSON.parse(serializeLangfuseTraceOutput([]))).toEqual([{ text: { content: '' } }]);
  });
});

describe('langfuseTraceOutputAllowedKeys', () => {
  it('allows reasoning items in trace.output and keeps other exclusions', () => {
    expect(langfuseTraceOutputAllowedKeys.has('reasoning')).toBe(true);
    expect(
      JSON.parse(
        serializeLangfuseValue(
          [{ reasoning: { content: 'think' } }, { text: { content: 'Hello' } }],
          { keepExcludedKeys: langfuseTraceOutputAllowedKeys }
        ) ?? ''
      )
    ).toEqual([{ reasoning: { content: 'think' } }, { text: { content: 'Hello' } }]);
  });
});

describe('serializeLangfuseValue', () => {
  it('removes sensitive workflow fields recursively and supports bigint', () => {
    expect(
      JSON.parse(
        serializeLangfuseValue({
          answer: 1n,
          history: ['private'],
          nested: { reasoningText: 'private', value: 'visible' }
        }) ?? ''
      )
    ).toEqual({ answer: '1', nested: { value: 'visible' } });
  });

  it('keeps explicitly allowed excluded keys only where the caller opts in', () => {
    expect(
      JSON.parse(
        serializeLangfuseValue(
          { reasoningText: 'think', history: ['private'] },
          { keepExcludedKeys: new Set(['reasoningText']) }
        ) ?? ''
      )
    ).toEqual({ reasoningText: 'think' });
  });

  it('bounds strings, arrays, object keys and nesting depth', () => {
    const serialized = serializeLangfuseValue({
      longText: 'a'.repeat(10001),
      items: Array.from({ length: 101 }, (_, index) => index),
      values: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key${index}`, index])),
      nested: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: { level8: 'too deep' }
                  }
                }
              }
            }
          }
        }
      }
    });
    const parsed = JSON.parse(serialized ?? '');

    expect(parsed.longText).toBe(`${'a'.repeat(10000)}...[truncated]`);
    expect(parsed.items).toHaveLength(101);
    expect(parsed.items.at(-1)).toBe('[Truncated]');
    expect(parsed.values.__truncated).toBe(true);
    expect(parsed.nested.level1.level2.level3.level4.level5.level6.level7).toBe('[MaxDepth]');
  });

  it('handles circular, binary and unsupported values without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      JSON.parse(
        serializeLangfuseValue({
          circular,
          binary: new Uint8Array([1, 2]),
          ignored: undefined
        }) ?? ''
      )
    ).toEqual({
      circular: { self: '[Circular]' },
      binary: '[Uint8Array length=2]'
    });
    expect(serializeLangfuseValue(Symbol('ignored'))).toBeUndefined();
  });

  it('caps the total payload and ignores objects that throw during inspection', () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`key${index}`, 'a'.repeat(10000)])
    );
    const serialized = serializeLangfuseValue(oversized);
    expect(JSON.parse(serialized ?? '')).toMatch(/\.\.\.\[truncated\]$/);

    const invalid = Object.create(null);
    Object.defineProperty(invalid, 'value', {
      enumerable: true,
      get() {
        throw new Error('cannot read');
      }
    });
    expect(serializeLangfuseValue(invalid)).toBeUndefined();
  });
});

describe('Langfuse initial attributes', () => {
  it('adds a Langfuse marker to root and step spans at creation time', () => {
    expect(
      getLangfuseTraceAttributes({
        sessionId: 'chat-1',
        userId: 'user-1',
        appId: 'app-1',
        appName: 'Assistant',
        input: [{ text: 'hello' }]
      })
    ).toMatchObject({
      'langfuse.trace.name': 'message',
      'langfuse.session.id': 'chat-1',
      'langfuse.user.id': 'user-1',
      'langfuse.trace.metadata.app_id': 'app-1',
      'langfuse.observation.metadata.app_id': 'app-1'
    });
    expect(
      getLangfuseStepStartAttributes({ appId: 'app-1', nodeId: 'node-1', nodeName: 'Node' })
    ).toEqual({
      'langfuse.observation.metadata.app_id': 'app-1',
      'langfuse.observation.metadata.nodeId': 'node-1',
      'langfuse.observation.metadata.nodeName': 'Node',
      'langfuse.trace.name': 'message'
    });
    expect(getLangfuseStepStartAttributes({ appId: 'app-1', nodeId: 'node-1' })).toEqual({
      'langfuse.observation.metadata.app_id': 'app-1',
      'langfuse.observation.metadata.nodeId': 'node-1',
      'langfuse.trace.name': 'message'
    });
  });
});
