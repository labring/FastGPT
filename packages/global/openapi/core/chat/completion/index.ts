import { getChatCompletionResponseExamples } from './examples';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import {
  ChatHomeBodySchema,
  ChatWorkflowSseResponseSchema,
  ChatTestPropsSchema,
  CompletionsPropsSchema,
  CompletionsResponseSchema
} from './api';

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

const v1ResponseExamples = getChatCompletionResponseExamples('v1');
const v2ResponseExamples = getChatCompletionResponseExamples('v2');

/* =============== OpenAPI Path =============== */

export const ChatCompletionPath: OpenAPIPath = {
  '/v1/chat/completions': {
    post: {
      tags: [DevApiTagsMap.chatController, SystemOpenApiTagMap.chatController],
      deprecated: true,
      summary: '发起会话v1',
      description: `v1 对话接口兼容 GPT 的接口。如果你的项目使用的是标准的 GPT 官方接口，可以直接通过修改 BaseUrl 和 Authorization 来访问 FastGPT 应用。

**注意事项**

- 传入的 \`model\`、\`temperature\` 等参数字段均无效，这些字段由编排决定，不会根据 API 参数改变。
- 不会返回实际消耗 \`Token\` 值。如果需要，可以设置 \`detail=true\`，并手动计算 \`responseData\` 里的 \`tokens\` 值。

**chatId 行为**

- 不传入（或为空）：不使用 FastGPT 提供的上下文功能，完全通过传入的 \`messages\` 构建上下文。
- 非空字符串：使用 chatId 进行对话，自动从 FastGPT 数据库取会话中的对话，并使用 \`messages\` 数组最后一个内容作为用户问题，其余 message 会被忽略。请自行确保 chatId 唯一，长度小于 250。

**stream / detail 组合**

- \`detail=false, stream=false\`：返回精简 JSON（仅 \`choices/usage/id\` 等）。
- \`detail=false, stream=true\`：返回兼容 GPT 的 SSE 流，只包含答案 chunk 和结束标记。
- \`detail=true, stream=false\`：在 JSON 中额外包含 \`responseData\`（各节点详细信息）和 \`newVariables\`。
- \`detail=true, stream=true\`：返回多 event 的 SSE 流（\`answer\` / \`flowNodeStatus\` / \`flowResponses\` 等）。

**交互节点**

如果工作流中包含交互节点，需要设置 \`detail=true\`：

- \`stream=true\`：可从 \`event=interactive\` 数据中获取交互节点的配置。
- \`stream=false\`：可从 \`choices[].message.content\` 中获取包含 \`interactive\` 字段的元素。

非流式响应中的 \`interactive\` 只包含 \`type\` 和 \`params\`，会向下提取 children / loop / tool 包装中最深层的交互，并过滤 \`entryNodeIds\` / \`memoryEdges\` / \`nodeOutputs\` 等内部运行态字段。SSE 可能保留子流程包装，可沿 \`params.childrenResponse\` 读取内层交互；event 示例省略内部运行态字段，并分别展示不同载荷分支。

接收到交互节点信息后，可以根据数据进行 UI 渲染并引导用户输入/选择，然后再次调用本接口继续工作流：

- 用户选择：直接将选择结果作为 user message 的 content 传入。
- 表单输入：将输入内容以对象形式序列化为字符串，作为 user message 的 content 传入；务必确保 \`chatId\` 一致。
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
              examples: v1ResponseExamples.json
            },
            'text/event-stream': {
              schema: ChatWorkflowSseResponseSchema.meta({
                description:
                  '工作流 SSE 事件流；v1 在 detail=true 时通过 flowResponses 汇总节点响应，最后以 [DONE] 结束'
              }),
              examples: { ...v1ResponseExamples.sse, ...v1ResponseExamples.eventExamples }
            }
          }
        }
      }
    }
  },
  '/v2/chat/completions': {
    post: {
      tags: [DevApiTagsMap.chatController, SystemOpenApiTagMap.chatController],
      summary: '发起对话 v2',
      description: `v2 对话接口兼容 GPT 的接口规范。

**密钥使用规范**

- 使用 APIKey 鉴权。调用 \`chat/completions\` 时，推荐在请求体传入 \`body.appId\`。
- 为兼容 OpenAI SDK，也支持 \`Authorization: Bearer <apiKey>-<appId>\`，此时不需要传递 \`body.appId\`。
- 有些 SDK 调用时，\`BaseUrl\` 需要添加 \`v1\` 路径，有些不需要，如果出现 404 情况，可补充 \`v1\` 重试。
- appId 的优先级：\`body.appId\` , \`<apiKey>-<appId>\` , \`apikey 关联的 appId(旧版适配)\`

**注意事项**

- 如需通过 \`authProxy\` 代理团队成员身份，需要团队所有者在创建或编辑该 key 时开启 \`authProxy\`；代理身份仍需要具备目标应用和会话权限。（仅适用于 FastGPT >= v4.15.0）
- 传入的 \`model\`，\`temperature\` 等参数字段均无效，这些字段由编排决定，不会根据 API 参数改变。
- 不会返回实际消耗 \`Token\` 值，如果需要，可以设置 \`detail=true\`，并手动计算 \`responseData\` 里的 \`tokens\` 值。

**chatId 行为**

- 不传入（或为空）：不使用 FastGPT 提供的上下文功能，完全通过传入的 \`messages\` 构建上下文。
- 非空字符串：使用 chatId 进行对话，自动从 FastGPT 数据库取会话中的对话，并使用 \`messages\` 数组最后一个内容作为用户问题，其余 message 会被忽略。请自行确保 chatId 唯一，长度小于 250。

**stream / detail 组合**

- \`detail=false, stream=false\`：返回精简 JSON（仅 \`choices/usage/id\` 等）。
- \`detail=false, stream=true\`：返回兼容 GPT 的 SSE 流，只包含答案 chunk 和结束标记。
- \`detail=true, stream=false\`：在 JSON 中额外包含 \`responseData\`（各节点详细信息）和 \`newVariables\`。
- \`detail=true, stream=true\`：返回多 event 的 SSE 流（\`answer\` / \`flowNodeStatus\` / \`flowNodeResponse\` / \`workflowDuration\` 等）。

Share 调用沿用相同的逐条事件协议，但会先按分享配置过滤公共字段；引用、运行状态和技能引用分别受 \`showCite\`、\`showRunningStatus\`、\`showSkillReferences\` 控制，知识库源文件下载仍受分享下载权限控制。

**交互节点**

如果工作流中包含交互节点，需要设置 \`detail=true\`：

- \`stream=true\`：可从 \`event=interactive\` 数据中获取交互节点的配置。
- \`stream=false\`：可从 \`choices[].message.content\` 中获取包含 \`interactive\` 字段的元素。

非流式响应中的 \`interactive\` 只包含 \`type\` 和 \`params\`，会向下提取 children / loop / tool 包装中最深层的交互，并过滤 \`entryNodeIds\` / \`memoryEdges\` / \`nodeOutputs\` 等内部运行态字段。SSE 可能保留子流程包装，可沿 \`params.childrenResponse\` 读取内层交互；event 示例省略内部运行态字段，并分别展示不同载荷分支。

接收到交互节点信息后，可以根据数据进行 UI 渲染并引导用户输入/选择，然后再次调用本接口继续工作流：

- 用户选择：直接将选择结果作为 user message 的 content 传入。
- 表单输入：将输入内容以对象形式序列化为字符串，作为 user message 的 content 传入；务必确保 \`chatId\` 一致。
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
              examples: v2ResponseExamples.json
            },
            'text/event-stream': {
              schema: ChatWorkflowSseResponseSchema.meta({
                description:
                  '工作流 SSE 事件流；v2 在 detail=true 时通过 flowNodeResponse 逐条发送节点响应，按 id + parentId 归并，最后以 [DONE] 结束'
              }),
              examples: { ...v2ResponseExamples.sse, ...v2ResponseExamples.eventExamples }
            }
          }
        }
      }
    }
  },
  '/core/chat/chatTest': {
    post: {
      tags: [DevApiTagsMap.chatController],
      summary: '测试对话（调试）',
      description: `调试运行 Agent / 工作流。接收完整的节点、边和聊天配置，按测试模式执行一次工作流，通过 SSE 流式返回运行结果与节点状态。仅用于 FastGPT 编排页面的调试预览，不建议作为对外接口使用。

响应为 SSE 流，event 结构与 \`/v1/chat/completions\` \`detail=true, stream=true\` 一致，包括 \`answer\` / \`flowNodeStatus\` / \`flowResponses\` / \`interactive\` 等。`,
      requestBody: {
        content: {
          'application/json': {
            schema: ChatTestPropsSchema
          }
        }
      },
      responses: {
        200: {
          description: 'SSE 流式响应',
          content: {
            'text/event-stream': {
              schema: ChatWorkflowSseResponseSchema,
              examples: {}
            }
          }
        }
      }
    }
  },
  '/proApi/core/chat/chatHome': {
    post: {
      tags: [DevApiTagsMap.chatController],
      summary: '应用聊天及工作流执行',
      description: '使用主页聊天配置和临时工作流执行一次应用对话，返回 SSE 流',
      requestBody: {
        content: {
          'application/json': {
            schema: ChatHomeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: 'SSE 流式响应',
          content: {
            'text/event-stream': {
              schema: ChatWorkflowSseResponseSchema
            }
          }
        }
      }
    }
  }
};
