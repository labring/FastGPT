import type { SandboxStatusPhase } from '../../../../core/chat/type';

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
 * 同一 event 的不同载荷分支放在同一代码块，用带序号的 SSE 注释区分；它们不代表同轮执行顺序。
 * 完整场景只使用基础载荷，避免把互斥的示例分支混进一次实际响应。
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
  const userSelectInteractive = userSelect.choices[0].message.content[0].interactive;
  const userInputInteractive = userInput.choices[0].message.content[0].interactive;
  const sandboxPhases = [
    'checkExisting',
    'connecting',
    'fetchSkills',
    'creatingContainer',
    'deployingSkills',
    'downloadingPackage',
    'uploadingPackage',
    'extractingPackage',
    'lazyInit',
    'upgrading',
    'ready',
    'failed'
  ] satisfies SandboxStatusPhase[];
  const eventDefinitions: {
    name: string;
    label: string;
    description: string;
    data: unknown;
    variants?: { label: string; data: unknown }[];
  }[] = [
    {
      name: 'answer',
      label: '回答增量',
      description:
        '包括空文本心跳、回答文本、reasoning_content 思考增量、stop 片段和 [DONE] 结束标记；下方分别展示。',
      data: answerDelta('电影《铃芽之旅》的导演是新海诚。'),
      variants: [
        { label: '空文本心跳', data: answerDelta('') },
        { label: '回答文本', data: answerDelta('电影《铃芽之旅》的导演是新海诚。') },
        {
          label: '思考增量',
          data: {
            choices: [
              {
                delta: { role: 'assistant', reasoning_content: '先核对电影的导演信息。' },
                index: 0,
                finish_reason: null
              }
            ]
          }
        },
        { label: '回答停止片段', data: answerDelta(null, 'stop') },
        { label: '整轮流结束', data: '[DONE]' }
      ]
    },
    {
      name: 'fastAnswer',
      label: '指定回复',
      description: '用于指定回复等即时输出；分别展示文本增量和停止片段。',
      data: answerDelta('正在查询相关资料。'),
      variants: [
        { label: '指定回复文本', data: answerDelta('正在查询相关资料。') },
        { label: '指定回复停止片段', data: answerDelta(null, 'stop') }
      ]
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
              'v2 按节点逐条发送；分别展示顶层和内部子节点。按 id + parentId 归并，无 parentId 时为顶层节点。',
            data: nodeResponse,
            variants: [
              { label: '顶层节点', data: nodeResponse },
              {
                label: '内部子节点',
                data: { ...nodeResponse, id: 'response-ai-child-1', parentId: 'response-agent-1' }
              }
            ]
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
      description: '初始化工具卡片；分别展示普通调用和 hideDetails 隐藏详情的调用。',
      data: { tool, responseValueId: tool.id },
      variants: [
        { label: '普通工具调用', data: { tool, responseValueId: tool.id } },
        {
          label: '隐藏工具参数和响应详情',
          data: { tool: { ...tool, params: '', hideDetails: true }, responseValueId: tool.id }
        }
      ]
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
      description: '按 tool.id 关联工具执行结果；response 支持字符串或 null。',
      data: { tool: { id: tool.id, response: '导演：新海诚' }, responseValueId: tool.id },
      variants: [
        {
          label: '字符串响应',
          data: { tool: { id: tool.id, response: '导演：新海诚' }, responseValueId: tool.id }
        },
        {
          label: '空响应',
          data: { tool: { id: tool.id, response: null }, responseValueId: tool.id }
        }
      ]
    },
    {
      name: 'updateVariables',
      label: '变量更新',
      description: '更新本轮工作流变量；变量值可以是字符串、数字、布尔值、数组、对象或 null。',
      data: {
        lastQuestion: '导演是谁',
        searchCount: 1,
        found: true,
        movieNames: ['铃芽之旅'],
        director: { name: '新海诚' },
        nextPage: null
      }
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
        '分别展示用户选择、表单、Agent 追问、欠费暂停及子流程包装。包装类型通过 params.childrenResponse 取内层交互；示例省略工作流运行态字段，各分支不会在同一轮依次出现。',
      data: { interactive: userSelectInteractive },
      // Workflow Builder 的 preview 是专用入口载荷，不作为 completions 的交互分支展示。
      variants: [
        { label: '用户选择：userSelect', data: { interactive: userSelectInteractive } },
        { label: '表单输入：userInput', data: { interactive: userInputInteractive } },
        {
          label: 'Agent 追问：agentAsk',
          data: {
            interactive: {
              type: 'agentAsk',
              askId: 'ask-1',
              params: {
                description: '需要确认查询范围后继续。',
                questions: [
                  {
                    question: '要查询哪个范围？',
                    options: [
                      { summary: '只查询当前电影', value: 'current_movie' },
                      { summary: '查询导演的全部作品', value: 'all_movies' }
                    ]
                  }
                ]
              }
            }
          }
        },
        {
          label: '欠费暂停：paymentPause',
          data: {
            interactive: {
              type: 'paymentPause',
              params: { description: '积分不足，请充值后继续。' }
            }
          }
        },
        {
          label: '子工作流包装：childrenInteractive',
          data: {
            interactive: {
              type: 'childrenInteractive',
              params: { childrenResponse: userSelectInteractive }
            }
          }
        },
        {
          label: '工具子流程包装：toolChildrenInteractive',
          data: {
            interactive: {
              type: 'toolChildrenInteractive',
              params: {
                childrenResponse: userInputInteractive,
                toolParams: { toolCallId: tool.id }
              }
            }
          }
        },
        {
          label: '循环子流程包装：loopInteractive',
          data: {
            interactive: {
              type: 'loopInteractive',
              params: { childrenResponse: userSelectInteractive, currentIndex: 0, loopResult: [] }
            }
          }
        },
        {
          label: '循环运行包装：loopRunInteractive',
          data: {
            interactive: {
              type: 'loopRunInteractive',
              params: { childrenResponse: userInputInteractive, iteration: 1, loopHistory: [] }
            }
          }
        }
      ]
    },
    {
      name: 'planStatus',
      label: '计划生成状态',
      description: '仅相关能力启用时发送；分别展示 generating 生成中和 updating 更新中。',
      data: { planStatus: { status: 'generating' } },
      variants: [
        { label: '生成计划', data: { planStatus: { status: 'generating' } } },
        { label: '更新计划', data: { planStatus: { status: 'updating' } } }
      ]
    },
    {
      name: 'plan',
      label: 'Agent 计划',
      description: '使用 plan.planId 标识计划，steps[].id 标识步骤，步骤状态随运行更新。',
      data: {
        plan: {
          planId: 'plan-1',
          name: '查询导演信息',
          steps: [
            { id: 'step-1', name: '确认电影名称', status: 'done' },
            { id: 'step-2', name: '检索电影资料', status: 'in_progress' },
            { id: 'step-3', name: '整理导演信息', status: 'pending' },
            { id: 'step-4', name: '核对付费资料', status: 'blocked', note: '等待用户授权' },
            { id: 'step-5', name: '补充无关作品', status: 'skipped', note: '不在本次范围内' }
          ]
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
      description:
        '展示各个可见 phase；ready 表示可执行工具，failed 可携带 message，技能部署阶段可携带 skillName。这些是可选分支，并非固定执行顺序。',
      data: { sandboxId: 'sandbox-1', phase: 'ready', isWarmStart: true },
      variants: sandboxPhases.map((phase) => ({
        label: `阶段：${phase}`,
        data: {
          sandboxId: 'sandbox-1',
          phase,
          ...((phase === 'connecting' || phase === 'ready') && { isWarmStart: true }),
          ...([
            'deployingSkills',
            'downloadingPackage',
            'uploadingPackage',
            'extractingPackage'
          ].includes(phase) && { skillName: '资料检索' }),
          ...(phase === 'failed' && { message: '沙箱初始化失败，请稍后重试。' })
        }
      }))
    },
    {
      name: 'error',
      label: '流式错误',
      description:
        '流已建立后的错误，包括仅 message 的通用错误，以及含 code / statusText / data 的业务错误；不能仅凭 HTTP 200 判断成功。',
      data: { message: '模型请求失败，请稍后重试' },
      variants: [
        { label: '通用错误', data: { message: '模型请求失败，请稍后重试' } },
        {
          label: '业务错误',
          data: {
            code: 510003,
            statusText: 'runtimeUpgradeInProgress',
            message: '沙箱正在升级，请稍后重试',
            data: null,
            httpStatus: 409
          }
        }
      ]
    }
  ];
  const events = eventDefinitions.map(({ data, variants, ...event }) => ({
    ...event,
    value: variants
      ? variants
          .map(
            (variant, index) =>
              `: ${index + 1}. ${variant.label}\n${createSseFrame(event.name, variant.data)}`
          )
          .join('')
      : createSseFrame(event.name, data)
  }));
  const eventValue = (name: string) =>
    createSseFrame(name, eventDefinitions.find((event) => event.name === name)!.data);
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
