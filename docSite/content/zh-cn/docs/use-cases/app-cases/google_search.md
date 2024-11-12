---
title: '接入谷歌搜索'
description: '将 FastGPT 接入谷歌搜索'
icon: 'search'
draft: false
toc: true
weight: 616
---

|                     |                       |
| --------------------- | --------------------- |
| 工具调用模式 ![](/imgs/google_search_3.webp) | 工具调用模式 ![](/imgs/google_search_4.webp) |
| 非工具调用模式 ![](/imgs/google_search_1.webp) | 非工具调用模式 ![](/imgs/google_search_2.webp) |


如上图，利用「HTTP请求」模块，你可以外接一个搜索引擎作为 AI 回复的参考资料。这里以调用 Google Search API 为例。注意：本文主要是为了介绍 「HTTP请求」模块，具体的搜索效果需要依赖提示词和搜索引擎，尤其是【搜索引擎】，简单的搜索引擎无法获取更详细的内容，这部分可能需要更多的调试。

## 注册 Google Search API

[参考这篇文章](https://zhuanlan.zhihu.com/p/174666017)，每天可以免费使用 100 次。

## 写一个 Google Search 接口

这里用 [Laf](https://laf.dev/) 快速实现一个接口，即写即发布，无需部署。务必打开 POST 请求方式。

{{% details title="Laf 谷歌搜索Demo" closed="true" %}}

```ts
import cloud from '@lafjs/cloud'

const googleSearchKey = "xxx"
const googleCxId = "3740cxxx"
const baseurl = "https://www.googleapis.com/customsearch/v1"

type RequestType = {
  searchKey: string
}

export default async function (ctx: FunctionContext) {
  const { searchKey } = ctx.body as RequestType
  console.log(ctx.body)
  if (!searchKey) {
    return {
      prompt: ""
    }
  }

  try {
    const { data } = await cloud.fetch.get(baseurl, {
      params: {
        q: searchKey,
        cx: googleCxId,
        key: googleSearchKey,
        c2coff: 1,
        start: 1,
        end: 20,
        dateRestrict: 'm[1]',
      }
    })
    const result = data.items.map((item) => item.snippet).join('\n');

    return { prompt: result }
  } catch (err) {
    console.log(err)
    ctx.response.status(500)
    return {
      message: "异常"
    }
  }
}
```

{{% /details %}}

## 模块编排 - 工具调用模式

利用工具模块，则无需多余的操作，直接由模型决定是否调用谷歌搜索，并生成检索词即可。

复制下面配置，进入「高级编排」，在右上角的 “...” 中选择「导入配置」，导入后修改「HTTP 请求」模块 - 请求地址 的值。

{{% details title="编排配置" closed="true" %}}

```json
{
  "nodes": [
    {
      "nodeId": "userGuide",
      "name": "系统配置",
      "intro": "可以配置应用的系统参数",
      "avatar": "/imgs/workflow/userGuide.png",
      "flowNodeType": "userGuide",
      "position": {
        "x": 262.2732338817093,
        "y": -476.00241136598146
      },
      "inputs": [
        {
          "key": "welcomeText",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "string",
          "label": "core.app.Welcome Text",
          "value": ""
        },
        {
          "key": "variables",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "core.app.Chat Variable",
          "value": []
        },
        {
          "key": "questionGuide",
          "valueType": "boolean",
          "renderTypeList": [
            "hidden"
          ],
          "label": "core.app.Question Guide",
          "value": false
        },
        {
          "key": "tts",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": {
            "type": "web"
          }
        },
        {
          "key": "whisper",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": {
            "open": false,
            "autoSend": false,
            "autoTTSResponse": false
          }
        },
        {
          "key": "scheduleTrigger",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": null
        }
      ],
      "outputs": []
    },
    {
      "nodeId": "448745",
      "name": "流程开始",
      "intro": "",
      "avatar": "/imgs/workflow/userChatInput.svg",
      "flowNodeType": "workflowStart",
      "position": {
        "x": 295.8944548701009,
        "y": 110.81336038514848
      },
      "inputs": [
        {
          "key": "userChatInput",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "valueType": "string",
          "label": "用户问题",
          "required": true,
          "toolDescription": "用户问题"
        }
      ],
      "outputs": [
        {
          "id": "userChatInput",
          "key": "userChatInput",
          "label": "core.module.input.label.user question",
          "valueType": "string",
          "type": "static"
        }
      ]
    },
    {
      "nodeId": "NOgbnBzUwDgT",
      "name": "工具调用",
      "intro": "通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。",
      "avatar": "/imgs/workflow/tool.svg",
      "flowNodeType": "tools",
      "showStatus": true,
      "position": {
        "x": 1028.8358722416106,
        "y": -500.8755882990822
      },
      "inputs": [
        {
          "key": "model",
          "renderTypeList": [
            "settingLLMModel",
            "reference"
          ],
          "label": "core.module.input.label.aiModel",
          "valueType": "string",
          "llmModelType": "all",
          "value": "FastAI-plus"
        },
        {
          "key": "temperature",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 0,
          "valueType": "number",
          "min": 0,
          "max": 10,
          "step": 1
        },
        {
          "key": "maxToken",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 2000,
          "valueType": "number",
          "min": 100,
          "max": 4000,
          "step": 50
        },
        {
          "key": "systemPrompt",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "max": 3000,
          "valueType": "string",
          "label": "core.ai.Prompt",
          "description": "core.app.tip.chatNodeSystemPromptTip",
          "placeholder": "core.app.tip.chatNodeSystemPromptTip",
          "value": "你是谷歌搜索机器人，根据当前问题和对话记录生成搜索词。你需要自行判断是否需要进行网络实时查询：\n- 如果需查询则生成搜索词。\n- 如果不需要查询则不返回字段。"
        },
        {
          "key": "history",
          "renderTypeList": [
            "numberInput",
            "reference"
          ],
          "valueType": "chatHistory",
          "label": "core.module.input.label.chat history",
          "required": true,
          "min": 0,
          "max": 30,
          "value": 6
        },
        {
          "key": "userChatInput",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "valueType": "string",
          "label": "用户问题",
          "required": true,
          "value": [
            "448745",
            "userChatInput"
          ]
        }
      ],
      "outputs": []
    },
    {
      "nodeId": "GMELVPxHfpg5",
      "name": "HTTP 请求",
      "intro": "调用谷歌搜索，查询相关内容",
      "avatar": "/imgs/workflow/http.png",
      "flowNodeType": "httpRequest468",
      "showStatus": true,
      "position": {
        "x": 1013.2159795348916,
        "y": 210.8685573380423
      },
      "inputs": [
        {
          "key": "system_addInputParam",
          "renderTypeList": [
            "addInputParam"
          ],
          "valueType": "dynamic",
          "label": "",
          "required": false,
          "description": "core.module.input.description.HTTP Dynamic Input",
          "editField": {
            "key": true,
            "valueType": true
          }
        },
        {
          "valueType": "string",
          "renderTypeList": [
            "reference"
          ],
          "key": "query",
          "label": "query",
          "toolDescription": "谷歌搜索检索词",
          "required": true,
          "canEdit": true,
          "editField": {
            "key": true,
            "description": true
          }
        },
        {
          "key": "system_httpMethod",
          "renderTypeList": [
            "custom"
          ],
          "valueType": "string",
          "label": "",
          "value": "POST",
          "required": true
        },
        {
          "key": "system_httpReqUrl",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "string",
          "label": "",
          "description": "core.module.input.description.Http Request Url",
          "placeholder": "https://api.ai.com/getInventory",
          "required": false,
          "value": "https://xxxxxx.laf.dev/google_search"
        },
        {
          "key": "system_httpHeader",
          "renderTypeList": [
            "custom"
          ],
          "valueType": "any",
          "value": [],
          "label": "",
          "description": "core.module.input.description.Http Request Header",
          "placeholder": "core.module.input.description.Http Request Header",
          "required": false
        },
        {
          "key": "system_httpParams",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "value": [],
          "label": "",
          "required": false
        },
        {
          "key": "system_httpJsonBody",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "value": "{\n  \"searchKey\": \"{{query}}\"\n}",
          "label": "",
          "required": false
        }
      ],
      "outputs": [
        {
          "id": "system_addOutputParam",
          "key": "system_addOutputParam",
          "type": "dynamic",
          "valueType": "dynamic",
          "label": "",
          "editField": {
            "key": true,
            "valueType": true
          }
        },
        {
          "id": "httpRawResponse",
          "key": "httpRawResponse",
          "label": "原始响应",
          "description": "HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。",
          "valueType": "any",
          "type": "static"
        },
        {
          "id": "M5YmxaYe8em1",
          "type": "dynamic",
          "key": "prompt",
          "valueType": "string",
          "label": "prompt"
        }
      ]
    }
  ],
  "edges": [
    {
      "source": "448745",
      "target": "NOgbnBzUwDgT",
      "sourceHandle": "448745-source-right",
      "targetHandle": "NOgbnBzUwDgT-target-left"
    },
    {
      "source": "NOgbnBzUwDgT",
      "target": "GMELVPxHfpg5",
      "sourceHandle": "selectedTools",
      "targetHandle": "selectedTools"
    }
  ]
}
```

{{% /details %}}

## 模块编排 - 非工具调用方式

复制下面配置，进入「高级编排」，在右上角的 “...” 中选择「导入配置」，导入后修改「HTTP 请求」模块 - 请求地址 的值。

{{% details title="编排配置" closed="true" %}}

```json
{
  "nodes": [
    {
      "nodeId": "userGuide",
      "name": "系统配置",
      "intro": "可以配置应用的系统参数",
      "avatar": "/imgs/workflow/userGuide.png",
      "flowNodeType": "userGuide",
      "position": {
        "x": 126.6166221945532,
        "y": -456.00079128406236
      },
      "inputs": [
        {
          "key": "welcomeText",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "string",
          "label": "core.app.Welcome Text",
          "value": ""
        },
        {
          "key": "variables",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "core.app.Chat Variable",
          "value": []
        },
        {
          "key": "questionGuide",
          "valueType": "boolean",
          "renderTypeList": [
            "hidden"
          ],
          "label": "core.app.Question Guide",
          "value": false
        },
        {
          "key": "tts",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": {
            "type": "web"
          }
        },
        {
          "key": "whisper",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": {
            "open": false,
            "autoSend": false,
            "autoTTSResponse": false
          }
        },
        {
          "key": "scheduleTrigger",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": null
        }
      ],
      "outputs": []
    },
    {
      "nodeId": "448745",
      "name": "流程开始",
      "intro": "",
      "avatar": "/imgs/workflow/userChatInput.svg",
      "flowNodeType": "workflowStart",
      "position": {
        "x": 189.99351048246606,
        "y": 50.36949968375285
      },
      "inputs": [
        {
          "key": "userChatInput",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "valueType": "string",
          "label": "用户问题",
          "required": true,
          "toolDescription": "用户问题"
        }
      ],
      "outputs": [
        {
          "id": "userChatInput",
          "key": "userChatInput",
          "label": "core.module.input.label.user question",
          "valueType": "string",
          "type": "static"
        }
      ]
    },
    {
      "nodeId": "TWD5BAqIIFaj",
      "name": "判断器",
      "intro": "根据一定的条件，执行不同的分支。",
      "avatar": "/imgs/workflow/ifElse.svg",
      "flowNodeType": "ifElseNode",
      "showStatus": true,
      "position": {
        "x": 1187.4821088468154,
        "y": -143.83989103517257
      },
      "inputs": [
        {
          "key": "condition",
          "valueType": "string",
          "label": "",
          "renderTypeList": [
            "hidden"
          ],
          "required": false,
          "value": "And"
        },
        {
          "key": "ifElseList",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "value": [
            {
              "variable": [
                "lG52GzzMm65z",
                "6yF19MRD3nuB"
              ],
              "condition": "isEmpty",
              "value": ""
            }
          ]
        }
      ],
      "outputs": [
        {
          "id": "IF",
          "key": "IF",
          "label": "IF",
          "valueType": "any",
          "type": "source"
        },
        {
          "id": "ELSE",
          "key": "ELSE",
          "label": "ELSE",
          "valueType": "any",
          "type": "source"
        }
      ]
    },
    {
      "nodeId": "1ljV0oTq4zeC",
      "name": "HTTP 请求",
      "intro": "可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）",
      "avatar": "/imgs/workflow/http.png",
      "flowNodeType": "httpRequest468",
      "showStatus": true,
      "position": {
        "x": 1992.0328696814468,
        "y": 127.08080019458595
      },
      "inputs": [
        {
          "key": "DYNAMIC_INPUT_KEY",
          "renderTypeList": [
            "addInputParam"
          ],
          "valueType": "dynamic",
          "label": "",
          "required": false,
          "description": "core.module.input.description.HTTP Dynamic Input",
          "editField": {
            "key": true,
            "valueType": true
          }
        },
        {
          "key": "searchKey",
          "valueType": "string",
          "label": "searchKey",
          "renderTypeList": [
            "reference"
          ],
          "description": "",
          "canEdit": true,
          "editField": {
            "key": true,
            "valueType": true
          },
          "value": [
            "lG52GzzMm65z",
            "6yF19MRD3nuB"
          ]
        },
        {
          "key": "system_httpMethod",
          "renderTypeList": [
            "custom"
          ],
          "valueType": "string",
          "label": "",
          "value": "POST",
          "required": true
        },
        {
          "key": "system_httpReqUrl",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "string",
          "label": "",
          "description": "core.module.input.description.Http Request Url",
          "placeholder": "https://api.ai.com/getInventory",
          "required": false,
          "value": "https://xxxxxx.laf.dev/google_search"
        },
        {
          "key": "system_httpHeader",
          "renderTypeList": [
            "custom"
          ],
          "valueType": "any",
          "value": [],
          "label": "",
          "description": "core.module.input.description.Http Request Header",
          "placeholder": "core.module.input.description.Http Request Header",
          "required": false
        },
        {
          "key": "system_httpParams",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "value": [],
          "label": "",
          "required": false
        },
        {
          "key": "system_httpJsonBody",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "value": "{\n  \"searchKey\": \"{{searchKey}}\"\n}",
          "label": "",
          "required": false
        },
        {
          "key": "system_addInputParam",
          "renderTypeList": [
            "addInputParam"
          ],
          "valueType": "dynamic",
          "label": "",
          "required": false,
          "description": "core.module.input.description.HTTP Dynamic Input",
          "editField": {
            "key": true,
            "valueType": true
          }
        }
      ],
      "outputs": [
        {
          "id": "system_addOutputParam",
          "key": "system_addOutputParam",
          "type": "dynamic",
          "valueType": "dynamic",
          "label": "",
          "editField": {
            "key": true,
            "valueType": true
          }
        },
        {
          "id": "httpRawResponse",
          "key": "httpRawResponse",
          "label": "原始响应",
          "description": "HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。",
          "valueType": "any",
          "type": "static"
        },
        {
          "id": "yw0oz9XWFXYf",
          "type": "dynamic",
          "key": "prompt",
          "valueType": "string",
          "label": "prompt"
        }
      ]
    },
    {
      "nodeId": "Nc6hBdb3l9Pe",
      "name": "AI 对话",
      "intro": "AI 大模型对话",
      "avatar": "/imgs/workflow/AI.png",
      "flowNodeType": "chatNode",
      "showStatus": true,
      "position": {
        "x": 1982.442841318768,
        "y": -664.9716343803625
      },
      "inputs": [
        {
          "key": "model",
          "renderTypeList": [
            "settingLLMModel",
            "reference"
          ],
          "label": "core.module.input.label.aiModel",
          "valueType": "string",
          "value": "gpt-3.5-turbo"
        },
        {
          "key": "temperature",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 0,
          "valueType": "number",
          "min": 0,
          "max": 10,
          "step": 1
        },
        {
          "key": "maxToken",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 2000,
          "valueType": "number",
          "min": 100,
          "max": 4000,
          "step": 50
        },
        {
          "key": "isResponseAnswerText",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": true,
          "valueType": "boolean"
        },
        {
          "key": "quoteTemplate",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string"
        },
        {
          "key": "quotePrompt",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string"
        },
        {
          "key": "systemPrompt",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "max": 3000,
          "valueType": "string",
          "label": "core.ai.Prompt",
          "description": "core.app.tip.chatNodeSystemPromptTip",
          "placeholder": "core.app.tip.chatNodeSystemPromptTip",
          "selectedTypeIndex": 1,
          "value": [
            "1ljV0oTq4zeC",
            "httpRawResponse"
          ]
        },
        {
          "key": "history",
          "renderTypeList": [
            "numberInput",
            "reference"
          ],
          "valueType": "chatHistory",
          "label": "core.module.input.label.chat history",
          "required": true,
          "min": 0,
          "max": 30,
          "value": 6
        },
        {
          "key": "userChatInput",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "valueType": "string",
          "label": "用户问题",
          "required": true,
          "toolDescription": "用户问题",
          "value": [
            "448745",
            "userChatInput"
          ]
        },
        {
          "key": "quoteQA",
          "renderTypeList": [
            "settingDatasetQuotePrompt"
          ],
          "label": "",
          "debugLabel": "知识库引用",
          "description": "",
          "valueType": "datasetQuote"
        }
      ],
      "outputs": [
        {
          "id": "history",
          "key": "history",
          "label": "core.module.output.label.New context",
          "description": "core.module.output.description.New context",
          "valueType": "chatHistory",
          "type": "static"
        },
        {
          "id": "answerText",
          "key": "answerText",
          "label": "core.module.output.label.Ai response content",
          "description": "core.module.output.description.Ai response content",
          "valueType": "string",
          "type": "static"
        }
      ]
    },
    {
      "nodeId": "FYLw1BokYUad",
      "name": "文本加工",
      "intro": "可对固定或传入的文本进行加工后输出，非字符串类型数据最终会转成字符串类型。",
      "avatar": "/imgs/workflow/textEditor.svg",
      "flowNodeType": "pluginModule",
      "showStatus": false,
      "position": {
        "x": 2479.5913201989906,
        "y": 288.52613614690904
      },
      "inputs": [
        {
          "key": "system_addInputParam",
          "valueType": "dynamic",
          "label": "动态外部数据",
          "renderTypeList": [
            "addInputParam"
          ],
          "required": false,
          "description": "",
          "canEdit": false,
          "value": "",
          "editField": {
            "key": true
          },
          "dynamicParamDefaultValue": {
            "inputType": "reference",
            "valueType": "string",
            "required": true
          }
        },
        {
          "key": "q",
          "valueType": "string",
          "label": "q",
          "renderTypeList": [
            "reference"
          ],
          "required": true,
          "description": "",
          "canEdit": true,
          "editField": {
            "key": true
          },
          "value": [
            "448745",
            "userChatInput"
          ]
        },
        {
          "key": "response",
          "valueType": "string",
          "label": "response",
          "renderTypeList": [
            "reference"
          ],
          "required": true,
          "description": "",
          "canEdit": true,
          "editField": {
            "key": true
          },
          "value": [
            "1ljV0oTq4zeC",
            "yw0oz9XWFXYf"
          ]
        },
        {
          "key": "文本",
          "valueType": "string",
          "label": "文本",
          "renderTypeList": [
            "textarea"
          ],
          "required": true,
          "description": "",
          "canEdit": false,
          "value": "请使用下面<data> </data>中的数据作为本次对话的参考。请直接输出答案，不要提及你是从<data> </data>中获取的知识。\n\n当前时间:{{cTime}}\n\n<data>\n{{response}}\n</data>\n\n我的问题:\"{{q}}\"",
          "editField": {
            "key": true
          },
          "maxLength": "",
          "dynamicParamDefaultValue": {
            "inputType": "reference",
            "valueType": "string",
            "required": true
          }
        }
      ],
      "outputs": [
        {
          "id": "text",
          "type": "static",
          "key": "text",
          "valueType": "string",
          "label": "text",
          "description": ""
        }
      ],
      "pluginId": "community-textEditor"
    },
    {
      "nodeId": "EX0g9oK3sCOC",
      "name": "AI 对话",
      "intro": "AI 大模型对话",
      "avatar": "/imgs/workflow/AI.png",
      "flowNodeType": "chatNode",
      "showStatus": true,
      "position": {
        "x": 3199.17223136331,
        "y": -100.06379812849427
      },
      "inputs": [
        {
          "key": "model",
          "renderTypeList": [
            "settingLLMModel",
            "reference"
          ],
          "label": "core.module.input.label.aiModel",
          "valueType": "string",
          "value": "gpt-3.5-turbo"
        },
        {
          "key": "temperature",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 0,
          "valueType": "number",
          "min": 0,
          "max": 10,
          "step": 1
        },
        {
          "key": "maxToken",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 2000,
          "valueType": "number",
          "min": 100,
          "max": 4000,
          "step": 50
        },
        {
          "key": "isResponseAnswerText",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": true,
          "valueType": "boolean"
        },
        {
          "key": "quoteTemplate",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string"
        },
        {
          "key": "quotePrompt",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string"
        },
        {
          "key": "systemPrompt",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "max": 3000,
          "valueType": "string",
          "label": "core.ai.Prompt",
          "description": "core.app.tip.chatNodeSystemPromptTip",
          "placeholder": "core.app.tip.chatNodeSystemPromptTip"
        },
        {
          "key": "history",
          "renderTypeList": [
            "numberInput",
            "reference"
          ],
          "valueType": "chatHistory",
          "label": "core.module.input.label.chat history",
          "required": true,
          "min": 0,
          "max": 30,
          "value": 6
        },
        {
          "key": "userChatInput",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "valueType": "string",
          "label": "用户问题",
          "required": true,
          "toolDescription": "用户问题",
          "value": [
            "FYLw1BokYUad",
            "text"
          ]
        },
        {
          "key": "quoteQA",
          "renderTypeList": [
            "settingDatasetQuotePrompt"
          ],
          "label": "",
          "debugLabel": "知识库引用",
          "description": "",
          "valueType": "datasetQuote"
        }
      ],
      "outputs": [
        {
          "id": "history",
          "key": "history",
          "label": "core.module.output.label.New context",
          "description": "core.module.output.description.New context",
          "valueType": "chatHistory",
          "type": "static"
        },
        {
          "id": "answerText",
          "key": "answerText",
          "label": "core.module.output.label.Ai response content",
          "description": "core.module.output.description.Ai response content",
          "valueType": "string",
          "type": "static"
        }
      ]
    },
    {
      "nodeId": "lG52GzzMm65z",
      "name": "文本内容提取",
      "intro": "可从文本中提取指定的数据，例如：sql语句、搜索关键词、代码等",
      "avatar": "/imgs/workflow/extract.png",
      "flowNodeType": "contentExtract",
      "showStatus": true,
      "position": {
        "x": 535.331344778598,
        "y": -437.1382636373696
      },
      "inputs": [
        {
          "key": "model",
          "renderTypeList": [
            "selectLLMModel",
            "reference"
          ],
          "label": "core.module.input.label.aiModel",
          "required": true,
          "valueType": "string",
          "llmModelType": "extractFields",
          "value": "gpt-3.5-turbo"
        },
        {
          "key": "description",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "valueType": "string",
          "label": "提取要求描述",
          "description": "给AI一些对应的背景知识或要求描述，引导AI更好的完成任务。\n该输入框可使用全局变量。",
          "placeholder": "例如: \n1. 当前时间为: {{cTime}}。你是一个实验室预约助手，你的任务是帮助用户预约实验室，从文本中获取对应的预约信息。\n2. 你是谷歌搜索助手，需要从文本中提取出合适的搜索词。",
          "value": "你是谷歌搜索机器人，根据当前问题和对话记录生成搜索词。你需要自行判断是否需要进行网络实时查询：\n- 如果需查询则生成搜索词。\n- 如果不需要查询则不返回字段。"
        },
        {
          "key": "history",
          "renderTypeList": [
            "numberInput",
            "reference"
          ],
          "valueType": "chatHistory",
          "label": "core.module.input.label.chat history",
          "required": true,
          "min": 0,
          "max": 30,
          "value": 6
        },
        {
          "key": "content",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "label": "需要提取的文本",
          "required": true,
          "valueType": "string",
          "toolDescription": "需要检索的内容",
          "value": [
            "448745",
            "userChatInput"
          ]
        },
        {
          "key": "extractKeys",
          "renderTypeList": [
            "custom"
          ],
          "label": "",
          "valueType": "any",
          "description": "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
          "value": [
            {
              "required": false,
              "defaultValue": "",
              "desc": "搜索词",
              "key": "searchKey",
              "enum": ""
            }
          ]
        }
      ],
      "outputs": [
        {
          "id": "fields",
          "key": "fields",
          "label": "完整提取结果",
          "description": "一个 JSON 字符串，例如：{\"name:\":\"YY\",\"Time\":\"2023/7/2 18:00\"}",
          "valueType": "string",
          "type": "static"
        },
        {
          "id": "6yF19MRD3nuB",
          "key": "searchKey",
          "label": "提取结果-搜索词",
          "valueType": "string",
          "type": "static"
        }
      ]
    }
  ],
  "edges": [
    {
      "source": "TWD5BAqIIFaj",
      "target": "Nc6hBdb3l9Pe",
      "sourceHandle": "TWD5BAqIIFaj-source-IF",
      "targetHandle": "Nc6hBdb3l9Pe-target-left"
    },
    {
      "source": "1ljV0oTq4zeC",
      "target": "FYLw1BokYUad",
      "sourceHandle": "1ljV0oTq4zeC-source-right",
      "targetHandle": "FYLw1BokYUad-target-left"
    },
    {
      "source": "FYLw1BokYUad",
      "target": "EX0g9oK3sCOC",
      "sourceHandle": "FYLw1BokYUad-source-right",
      "targetHandle": "EX0g9oK3sCOC-target-left"
    },
    {
      "source": "448745",
      "target": "lG52GzzMm65z",
      "sourceHandle": "448745-source-right",
      "targetHandle": "lG52GzzMm65z-target-left"
    },
    {
      "source": "lG52GzzMm65z",
      "target": "TWD5BAqIIFaj",
      "sourceHandle": "lG52GzzMm65z-source-right",
      "targetHandle": "TWD5BAqIIFaj-target-left"
    },
    {
      "source": "TWD5BAqIIFaj",
      "target": "1ljV0oTq4zeC",
      "sourceHandle": "TWD5BAqIIFaj-source-ELSE",
      "targetHandle": "1ljV0oTq4zeC-target-left"
    }
  ]
}
```

{{% /details %}}


### 流程说明

1. 利用【文本内容提取】模块，将用户的问题提取成搜索关键词。
2. 将搜索关键词传入【HTTP请求】模块，执行谷歌搜索。
3. 利用【文本加工】模块组合搜索结果和问题，生成一个适合模型回答的问题。
4. 将新的问题发给【AI对话】模块，回答搜索结果。

