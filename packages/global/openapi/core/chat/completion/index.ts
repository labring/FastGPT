import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { CompletionsPropsSchema, CompletionsResponseSchema } from './api';

/* =============== Request examples =============== */

const basicRequestExample = {
  chatId: 'my_chatId',
  stream: false,
  detail: false,
  responseChatItemId: 'my_responseChatItemId',
  variables: {
    uid: 'asdfadsfasfd2323',
    name: '张三'
  },
  messages: [
    {
      role: 'user',
      content: '导演是谁'
    }
  ]
};

const imageFileRequestExample = {
  chatId: 'abcd',
  stream: false,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '导演是谁' },
        { type: 'image_url', image_url: { url: '图片链接' } },
        {
          type: 'file_url',
          name: '文件名',
          url: '文档链接，支持 txt md html word pdf ppt csv excel'
        }
      ]
    }
  ]
};

const userSelectInteractiveRequestExample = {
  stream: true,
  detail: true,
  chatId: '22222231',
  messages: [{ role: 'user', content: 'Confirm' }]
};

const userInputInteractiveRequestExample = {
  stream: true,
  detail: true,
  chatId: '22231',
  messages: [
    {
      role: 'user',
      content: '{"测试 1":"这是输入框的内容","测试 2":666}'
    }
  ]
};

/* =============== Response examples =============== */

// detail=false, stream=false
const detailFalseStreamFalseExample = {
  id: 'adsfasf',
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

// 交互节点-用户选择 (非流式响应,从 choices 中获取 type=interactive)
const interactiveUserSelectResponseExample = {
  id: 'chatId',
  model: '',
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
  choices: [
    {
      message: {
        role: 'assistant',
        content: [
          {
            type: 'interactive',
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
};

// 交互节点-表单输入 (非流式响应)
const interactiveUserInputResponseExample = {
  id: 'chatId',
  model: '',
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
  choices: [
    {
      message: {
        role: 'assistant',
        content: [
          {
            type: 'interactive',
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
};

// detail=false, stream=true
// 注：示例为简化版，省略了 object/created 等占位字段；真实响应每行还会带这些字段
const detailFalseStreamTrueExample = `data: {"choices":[{"delta":{"content":""}}]}
data: {"choices":[{"delta":{"content":"电影"}}]}
data: {"choices":[{"delta":{"content":"《铃芽之旅》"}}]}
data: {"choices":[{"delta":{"content":"的导演"}}]}
data: {"choices":[{"delta":{"content":"是新海诚。"}}]}
data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]`;

// detail=true, stream=true
const detailTrueStreamTrueExample = `event: flowNodeStatus
data: {"status":"running","name":"知识库搜索"}

event: flowNodeStatus
data: {"status":"running","name":"AI 对话"}

event: answer
data: {"choices":[{"delta":{"content":"电影"}}]}

event: answer
data: {"choices":[{"delta":{"content":"《铃芽之旅》"}}]}

event: answer
data: {"choices":[{"delta":{"content":"的导演是新海诚。"}}]}

event: answer
data: {"choices":[{"delta":{},"finish_reason":"stop"}]}

event: answer
data: [DONE]

event: flowResponses
data: [{"moduleName":"知识库搜索","runningTime":1.78}, ...]`;

// 交互节点 stream 响应
const interactiveStreamExample = `event: interactive
data: {"interactive":{"type":"userSelect","params":{...}}}

event: answer
data: [DONE]`;

/* =============== OpenAPI Path =============== */

export const ChatCompletionPath: OpenAPIPath = {
  '/v1/chat/completions': {
    post: {
      tags: [TagsMap.chatController],
      summary: '请求对话 Agent 和工作流',
      description: `v1 对话接口兼容 GPT 的接口。如果你的项目使用的是标准的 GPT 官方接口，可以直接通过修改 BaseUrl 和 Authorization 来访问 FastGPT 应用。

**注意事项**

- 该接口的 API Key 需使用「应用特定的 key」，否则会报错。
- 传入的 \`model\`、\`temperature\` 等参数字段均无效，这些字段由编排决定，不会根据 API 参数改变。
- 不会返回实际消耗 \`Token\` 值。如果需要，可以设置 \`detail=true\`，并手动计算 \`responseData\` 里的 \`tokens\` 值。

**chatId 行为**

- 不传入（或为空）：不使用 FastGPT 提供的上下文功能，完全通过传入的 \`messages\` 构建上下文。
- 非空字符串：使用 chatId 进行对话，自动从 FastGPT 数据库取历史记录，并使用 \`messages\` 数组最后一个内容作为用户问题，其余 message 会被忽略。请自行确保 chatId 唯一，长度小于 250。

**stream / detail 组合**

- \`detail=false, stream=false\`：返回精简 JSON（仅 \`choices/usage/id\` 等）。
- \`detail=false, stream=true\`：返回兼容 GPT 的 SSE 流。
- \`detail=true, stream=false\`：在 JSON 中额外包含 \`responseData\`（各节点详细信息）和 \`newVariables\`。
- \`detail=true, stream=true\`：返回多 event 的 SSE 流（\`answer\` / \`flowNodeStatus\` / \`flowResponses\` 等）。

**event 取值**（\`stream=true\` 场景下，\`detail=true\` 才会有非 answer 的 event）

- \`answer\`：返回给客户端的文本（最终会算作回答）。
- \`fastAnswer\`：指定回复返回给客户端的文本（最终会算作回答）。
- \`toolCall\` / \`toolParams\` / \`toolResponse\`：工具相关。
- \`flowNodeStatus\`：运行到的节点状态。
- \`flowResponses\`：节点完整响应。
- \`updateVariables\`：更新变量。
- \`interactive\`：交互节点配置。
- \`error\`：报错。

**交互节点**

如果工作流中包含交互节点，需要设置 \`detail=true\`：

- \`stream=true\`：可从 \`event=interactive\` 数据中获取交互节点的配置。
- \`stream=false\`：可从 \`choices\` 中获取 \`type=interactive\` 的元素。

接收到交互节点信息后，可以根据数据进行 UI 渲染并引导用户输入/选择，然后再次调用本接口继续工作流：

- 用户选择：直接将选择结果作为 user message 的 content 传入。
- 表单输入：将输入内容以对象形式序列化为字符串，作为 user message 的 content 传入；务必确保 \`chatId\` 一致。

---

## SSE 响应示例（\`stream=true\`）

OpenAPI 渲染器对 \`text/event-stream\` 示例支持有限，因此 SSE 示例在此以 markdown 形式给出。

> 下方示例为简化版本（省略了 \`id\`/\`object\`/\`created\` 等占位字段，\`...\` 表示省略的内容）。\`interactive.params\` 的完整结构请参考下方 Responses → application/json 中的 \`interactiveUserSelect\` / \`interactiveUserInput\` example。

### \`detail=false, stream=true\`

兼容 GPT 的 SSE 流，仅包含 \`data\`（无 \`event\`）：

\`\`\`text
${detailFalseStreamTrueExample}
\`\`\`

### \`detail=true, stream=true\`

包含 \`flowNodeStatus\` / \`answer\` / \`flowResponses\` 等多种 event：

\`\`\`text
${detailTrueStreamTrueExample}
\`\`\`

### 交互节点 stream 响应

\`detail=true, stream=true\` 时，工作流命中交互节点：

\`\`\`text
${interactiveStreamExample}
\`\`\`
`,
      requestBody: {
        content: {
          'application/json': {
            schema: CompletionsPropsSchema,
            examples: {
              basic: {
                summary: '基础请求示例',
                value: basicRequestExample
              },
              imageFile: {
                summary: '图片/文件请求示例',
                description:
                  '仅 messages 有部分区别，其他参数一致。目前不支持上传文件，需自行上传到对象存储后传入文件链接',
                value: imageFileRequestExample
              },
              interactiveUserSelect: {
                summary: '交互节点-用户选择 继续运行',
                description: '直接传递选择结果作为 user message 的 content',
                value: userSelectInteractiveRequestExample
              },
              interactiveUserInput: {
                summary: '交互节点-表单输入 继续运行',
                description:
                  '将表单输入内容以对象形式序列化成字符串，作为 user message 的 content。对象 key 对应表单 key',
                value: userInputInteractiveRequestExample
              }
            }
          }
        }
      },
      responses: {
        200: {
          content: {
            'application/json': {
              schema: CompletionsResponseSchema,
              examples: {
                detailFalseStreamFalse: {
                  summary: 'detail=false, stream=false 响应',
                  description: '精简 JSON 响应，仅包含基础字段',
                  value: detailFalseStreamFalseExample
                },
                detailTrueStreamFalse: {
                  summary: 'detail=true, stream=false 响应',
                  description:
                    '在精简响应基础上额外包含 responseData（各节点详细信息）和 newVariables',
                  value: detailTrueStreamFalseExample
                },
                interactiveUserSelect: {
                  summary: '交互节点-用户选择 响应',
                  description:
                    '工作流命中用户选择交互节点。从 choices[].message.content 中获取 type=interactive 的元素',
                  value: interactiveUserSelectResponseExample
                },
                interactiveUserInput: {
                  summary: '交互节点-表单输入 响应',
                  description:
                    '工作流命中表单输入交互节点。从 choices[].message.content 中获取 type=interactive 的元素',
                  value: interactiveUserInputResponseExample
                }
              }
            },
            'text/event-stream': {
              examples: {}
            }
          }
        }
      }
    }
  }
};
