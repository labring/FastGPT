export type CompletionExampleVersion = 'v1' | 'v2';

/** SSE 帧以空行分隔，示例保持可直接解析的 wire 格式，不混入省略号占位。 */
const createSseFrame = (event: string | undefined, data: unknown) =>
  `${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

/* =============== Response examples =============== */

// detail=false, stream=false
const detailFalseStreamFalseExample = {
  id: 'adsfasf',
  title: '铃芽之旅导演',
  model: '',
  usage: {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 1
  },
  choices: [
    {
      message: {
        role: 'assistant',
        content: '电影《铃芽之旅》的导演是新海诚。'
      },
      finish_reason: 'stop',
      index: 0
    }
  ]
};

// detail=true, stream=false
const detailTrueStreamFalseExample = {
  responseData: [
    {
      moduleName: 'Dataset Search',
      price: 1.2000000000000002,
      model: 'Embedding-2',
      tokens: 6,
      similarity: 0.61,
      limit: 3
    },
    {
      moduleName: 'AI Chat',
      price: 454.5,
      model: 'FastAI-4k',
      tokens: 303,
      question: '导演是谁',
      answer: '电影《铃芽之旅》的导演是新海诚。',
      maxToken: 2050,
      quoteList: [
        {
          dataset_id: '646627f4f7b896cfd8910e38',
          id: '8099',
          q: '本作的主人公是谁？',
          a: '本作的主人公是名叫铃芽的少女。',
          source: '手动修改'
        },
        {
          dataset_id: '646627f4f7b896cfd8910e38',
          id: '19339',
          q: '电影《铃芽之旅》的导演是谁？',
          a: '电影《铃芽之旅》的导演是新海诚。',
          source: '手动修改'
        }
      ],
      completeMessages: [
        {
          obj: 'System',
          value:
            '下面是知识库内容:\n1. [本作的主人公是谁？\n本作的主人公是名叫铃芽的少女。]\n2. [电影《铃芽之旅》的导演是谁？\n电影《铃芽之旅》的导演是新海诚。]\n'
        },
        { obj: 'Human', value: '导演是谁' },
        { obj: 'AI', value: '电影《铃芽之旅》的导演是新海诚。' }
      ]
    }
  ],
  newVariables: {
    uid: 'asdfadsfasfd2323',
    name: '张三'
  },
  id: '',
  title: '铃芽之旅导演',
  model: '',
  usage: {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 1
  },
  choices: [
    {
      message: {
        role: 'assistant',
        content: '电影《铃芽之旅》的导演是新海诚。'
      },
      finish_reason: 'stop',
      index: 0
    }
  ]
};

/** 构造交互节点用户选择的非流式响应示例，v1 额外包含兼容 type 字段。 */
const createInteractiveUserSelectResponseExample = (includeLegacyType: boolean) => ({
  id: 'chatId',
  model: '',
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
  choices: [
    {
      message: {
        role: 'assistant',
        content: [
          {
            ...(includeLegacyType && { type: 'interactive' }),
            interactive: {
              type: 'userSelect',
              params: {
                description: '测试',
                userSelectOptions: [
                  { value: 'Confirm', key: 'option1' },
                  { value: 'Cancel', key: 'option2' }
                ]
              }
            }
          }
        ]
      },
      finish_reason: 'stop',
      index: 0
    }
  ]
});

/** 构造交互节点表单输入的非流式响应示例，v1 额外包含兼容 type 字段。 */
const createInteractiveUserInputResponseExample = (includeLegacyType: boolean) => ({
  id: 'chatId',
  model: '',
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
  choices: [
    {
      message: {
        role: 'assistant',
        content: [
          {
            ...(includeLegacyType && { type: 'interactive' }),
            interactive: {
              type: 'userInput',
              params: {
                description: '测试',
                inputForm: [
                  {
                    type: 'input',
                    key: '测试 1',
                    label: '测试 1',
                    description: '',
                    value: '',
                    defaultValue: '',
                    valueType: 'string',
                    required: false,
                    list: [{ label: '', value: '' }]
                  },
                  {
                    type: 'numberInput',
                    key: '测试 2',
                    label: '测试 2',
                    description: '',
                    value: '',
                    defaultValue: '',
                    valueType: 'number',
                    required: false,
                    list: [{ label: '', value: '' }]
                  }
                ]
              }
            }
          }
        ]
      },
      finish_reason: 'stop',
      index: 0
    }
  ]
});

/**
 * 提供文档和专用示例面板共用的响应示例，区分 v1 汇总事件和 v2 逐节点事件。
 * 数值与内容用于演示；可选 event 随工作流能力出现，不保证每次请求都发送。
 */
export const getChatCompletionResponseExamples = (version: CompletionExampleVersion) => {
  const includeLegacyType = version === 'v1';
  const userSelect = createInteractiveUserSelectResponseExample(includeLegacyType);
  const userInput = createInteractiveUserInputResponseExample(includeLegacyType);
  const answerDelta = (content: string | null, finishReason: 'stop' | null = null) => ({
    choices: [{ delta: { role: 'assistant', content }, index: 0, finish_reason: finishReason }]
  });
  const nodeResponse = {
    id: 'response-ai-1',
    nodeId: 'ai-1',
    moduleType: 'chatNode',
    moduleName: 'AI 对话',
    runningTime: 1.86,
    textOutput: '电影《铃芽之旅》的导演是新海诚。'
  };
  const tool = {
    id: 'call-search-1',
    toolName: '知识库搜索',
    toolAvatar: '/imgs/workflow/db.png',
    functionName: 'dataset_search',
    params: '{"query":"铃芽之旅导演"}'
  };
  const events = [
    {
      name: 'answer',
      label: '回答增量',
      description: '逐段追加 choices[].delta.content；reasoning_content 可承载思考增量。',
      data: answerDelta('电影《铃芽之旅》的导演是新海诚。')
    },
    {
      name: 'fastAnswer',
      label: '指定回复',
      description: '结构与 answer 一致，用于指定回复等即时输出。',
      data: answerDelta('正在查询相关资料。')
    },
    {
      name: 'flowNodeStatus',
      label: '节点状态',
      description: '节点开始运行时发送；分享调用受运行状态展示权限控制。',
      data: { status: 'running', name: '知识库搜索' }
    },
    ...(version === 'v2'
      ? [
          {
            name: 'flowNodeResponse',
            label: '节点响应',
            description:
              'v2 按节点逐条发送，包括内部子节点；按 id + parentId 归并，无 parentId 时为顶层节点。',
            data: { ...nodeResponse, parentId: 'response-agent-1' }
          }
        ]
      : [
          {
            name: 'flowResponses',
            label: '节点响应汇总',
            description: 'v1 在本轮结束时发送节点响应数组，位于 [DONE] 之前。',
            data: [nodeResponse]
          }
        ]),
    {
      name: 'toolCall',
      label: '工具调用',
      description: '初始化工具卡片，后续参数和响应按 tool.id 关联。',
      data: { tool, responseValueId: tool.id }
    },
    {
      name: 'toolParams',
      label: '工具参数增量',
      description: '按 tool.id 追加或合并工具参数，不代表工具已执行完成。',
      data: { tool: { id: tool.id, params: '{"query":"铃芽之旅导演"}' }, responseValueId: tool.id }
    },
    {
      name: 'toolResponse',
      label: '工具响应',
      description: '按 tool.id 关联工具执行结果。',
      data: { tool: { id: tool.id, response: '导演：新海诚' }, responseValueId: tool.id }
    },
    {
      name: 'updateVariables',
      label: '变量更新',
      description: '更新本轮工作流产生的变量。',
      data: { lastQuestion: '导演是谁' }
    },
    {
      name: 'workflowDuration',
      label: '执行耗时',
      description: '本轮工作流总耗时，durationSeconds 的单位为秒。',
      data: { durationSeconds: 2.41 }
    },
    {
      name: 'chatTitle',
      label: '会话标题',
      description: '仅 detail=true、未命名会话标题生成成功时发送；不会覆盖手动标题。',
      data: { title: '铃芽之旅导演' }
    },
    {
      name: 'interactive',
      label: '交互配置',
      description:
        '渲染用户选择或表单；保持 chatId，再次提交用户输入以继续执行。仅返回 type / params。',
      data: { interactive: userSelect.choices[0].message.content[0].interactive }
    },
    {
      name: 'planStatus',
      label: '计划生成状态',
      description: 'Agent 计划生成或更新中的状态，仅相关能力启用时发送。',
      data: { planStatus: { status: 'generating' } }
    },
    {
      name: 'plan',
      label: 'Agent 计划',
      description: '使用 plan.planId 标识计划，steps[].id 标识步骤，步骤状态随运行更新。',
      data: {
        plan: {
          planId: 'plan-1',
          name: '查询导演信息',
          steps: [{ id: 'step-1', name: '检索电影资料', status: 'in_progress' }]
        }
      }
    },
    {
      name: 'skillCall',
      label: '技能调用',
      description: '加载技能说明时发送技能展示信息，仅相关能力启用时出现。',
      data: {
        skill: {
          id: 'skill-call-1',
          skillName: '资料检索',
          skillAvatar: '/icon/logo.svg',
          description: '查询相关资料',
          skillMdPath: '/skills/search/SKILL.md'
        }
      }
    },
    {
      name: 'sandboxStatus',
      label: '沙箱状态',
      description: '沙箱创建、连接或就绪状态；ready 表示可执行工具。',
      data: { sandboxId: 'sandbox-1', phase: 'ready', isWarmStart: true }
    },
    {
      name: 'error',
      label: '流式错误',
      description: '流已建立后发生的错误；读取 message 处理失败，不能仅凭 HTTP 200 判断成功。',
      data: { message: '模型请求失败，请稍后重试' }
    }
  ].map(({ data, ...event }) => ({ ...event, value: createSseFrame(event.name, data) }));
  const eventValue = (name: string) => events.find((event) => event.name === name)!.value;
  const done = createSseFrame('answer', '[DONE]');
  const ordinaryStream = [
    eventValue('flowNodeStatus'),
    createSseFrame('answer', answerDelta('电影')),
    createSseFrame('answer', answerDelta('《铃芽之旅》的导演是新海诚。')),
    ...(version === 'v2' ? [createSseFrame('flowNodeResponse', nodeResponse)] : []),
    eventValue('updateVariables'),
    eventValue('workflowDuration'),
    eventValue('chatTitle'),
    createSseFrame('answer', answerDelta(null, 'stop')),
    ...(version === 'v1' ? [eventValue('flowResponses')] : []),
    done
  ].join('');
  const json = {
    detailFalseStreamFalse: {
      summary: '精简 JSON',
      description: 'detail=false, stream=false；仅包含基础回复字段。',
      value: detailFalseStreamFalseExample
    },
    detailTrueStreamFalse: {
      summary: '详细 JSON',
      description: 'detail=true, stream=false；包含 responseData 和 newVariables。',
      value: detailTrueStreamFalseExample
    },
    interactiveUserSelect: {
      summary: '用户选择',
      description: 'detail=true；从 choices[].message.content 获取 interactive 展示配置。',
      value: userSelect
    },
    interactiveUserInput: {
      summary: '表单输入',
      description: 'detail=true；按表单字段名提交序列化 JSON，并保持 chatId。',
      value: userInput
    }
  };
  const sse = {
    detailFalseStreamTrue: {
      summary: '精简 SSE',
      description: 'detail=false, stream=true；普通成功回答仅包含 data 帧，最后为 [DONE]。',
      value:
        ['', '电影', '《铃芽之旅》的导演是新海诚。']
          .map((text) => createSseFrame(undefined, answerDelta(text)))
          .join('') +
        createSseFrame(undefined, answerDelta(null, 'stop')) +
        createSseFrame(undefined, '[DONE]')
    },
    detailTrueStreamTrue: {
      summary: '完整过程',
      description: `detail=true, stream=true；${version === 'v1' ? '节点详情汇总为 flowResponses。' : '节点详情逐条通过 flowNodeResponse 发送。'}示意顺序不代表固定时序，标题可能提前产生。`,
      value: ordinaryStream
    },
    interactiveUserSelect: {
      summary: '用户选择',
      description: 'detail=true；收到 interactive 后展示选项，提交选择值继续执行。',
      value: eventValue('interactive') + done
    },
    interactiveUserInput: {
      summary: '表单输入',
      description: 'detail=true；收到 interactive 后展示表单，提交表单 JSON 字符串继续执行。',
      value:
        createSseFrame('interactive', {
          interactive: userInput.choices[0].message.content[0].interactive
        }) + done
    }
  };
  return {
    json,
    sse,
    events,
    eventExamples: Object.fromEntries(
      events.map(({ name, label, description, value }) => [
        `event_${name}`,
        { summary: `${name} · ${label}`, description, value }
      ])
    )
  };
};
