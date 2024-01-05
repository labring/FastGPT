---
title: '接入谷歌搜索'
description: '将 FastGPT 接入谷歌搜索'
icon: 'search'
draft: false
toc: true
weight: 402
---

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/google_search_1.jpg) | ![](/imgs/google_search_2.jpg) |


如上图，利用 HTTP 模块，你可以外接一个搜索引擎作为AI回复的参考资料。这里以调用 Google Search API 为例。注意：本文主要是为了介绍 HTTP 模型，具体的搜索效果需要依赖提示词和搜索引擎，尤其是【搜索引擎】，简单的搜索引擎无法获取更详细的内容，这部分可能需要更多的调试。

## 注册 Google Search API

[参考这篇文章](https://zhuanlan.zhihu.com/p/174666017)，每天可以免费使用 100 次。

## 写一个 Google Search 接口

这里用 [Laf](https://laf.dev/) 快速实现一个接口，即写即发布，无需部署。务必打开 POST 请求方式。

{{% details title="Laf 谷歌搜索Demo" closed="true" %}}

```ts
import cloud from '@lafjs/cloud'

const googleSearchKey = ""
const googleCxId = ""
const baseurl = "https://www.googleapis.com/customsearch/v1"

type RequestType = {
  data: {
    searchKey: string
  }
}

export default async function (ctx: FunctionContext) {
  const { data: { searchKey } } = ctx.body as RequestType

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
        end: 10,
        dateRestrict: 'm[1]',
      }
    })
    // 获取搜索结果
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

## 模块编排

复制下面配置，点击「高级编排」右上角的导入按键，导入该配置，导入后将接口地址复制到「HTTP 模块」。

{{% details title="编排配置" closed="true" %}}

```json
[
  {
    "moduleId": "userChatInput",
    "name": "用户问题(对话入口)",
    "avatar": "/imgs/module/userChatInput.png",
    "flowType": "questionInput",
    "position": {
      "x": -210.28388868386423,
      "y": 1577.7262770270404
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "valueType": "string",
        "label": "用户问题",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "用户问题",
        "type": "source",
        "valueType": "string",
        "targets": [
          {
            "moduleId": "p9h459",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "6g2075",
    "name": "文本内容提取",
    "avatar": "/imgs/module/extract.png",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 787.652411398441,
      "y": 1168.747396089701
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "model",
        "type": "selectExtractModel",
        "valueType": "string",
        "label": "提取模型",
        "required": true,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "gpt-3.5-turbo",
        "connected": false
      },
      {
        "key": "description",
        "type": "textarea",
        "valueType": "string",
        "label": "提取要求描述",
        "description": "给AI一些对应的背景知识或要求描述，引导AI更好的完成任务",
        "required": true,
        "placeholder": "例如: \n1. 你是一个实验室预约助手，你的任务是帮助用户预约实验室。\n2. 你是谷歌搜索助手，需要从文本中提取出合适的搜索词。",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "value": "你是谷歌搜索机器人，根据当前问题和对话记录生成搜索词，当前时间是: {{cTime}}。\n你需要自行判断是否需要进行网络实时查询：\n- 如果需查询则生成搜索词。\n- 如果不需要查询则返回空字符串。",
        "connected": false
      },
      {
        "key": "history",
        "type": "numberInput",
        "label": "core.module.input.label.chat history",
        "required": true,
        "min": 0,
        "max": 30,
        "valueType": "chatHistory",
        "value": 2,
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "content",
        "type": "target",
        "label": "需要提取的文本",
        "required": true,
        "valueType": "string",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      },
      {
        "key": "extractKeys",
        "type": "custom",
        "label": "目标字段",
        "valueType": "any",
        "description": "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
        "value": [
          {
            "desc": "搜索词",
            "key": "searchKey",
            "required": false,
            "enum": ""
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "success",
        "label": "字段完全提取",
        "valueType": "boolean",
        "type": "source",
        "targets": []
      },
      {
        "key": "failed",
        "label": "提取字段缺失",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "5jtdwx",
            "key": "switch"
          }
        ]
      },
      {
        "key": "fields",
        "label": "完整提取结果",
        "description": "一个 JSON 字符串，例如：{\"name:\":\"YY\",\"Time\":\"2023/7/2 18:00\"}",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "searchKey",
        "label": "提取结果-搜索词",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": [
          {
            "moduleId": "ee1kxy",
            "key": "searchKey"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "ee1kxy",
    "name": "HTTP模块",
    "avatar": "/imgs/module/http.png",
    "flowType": "httpRequest",
    "showStatus": true,
    "position": {
      "x": 1608.5495771387305,
      "y": 1844.976739172803
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "system_httpMethod",
        "type": "select",
        "valueType": "string",
        "label": "core.module.input.label.Http Request Method",
        "value": "POST",
        "list": [
          {
            "label": "GET",
            "value": "GET"
          },
          {
            "label": "POST",
            "value": "POST"
          }
        ],
        "required": true,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "system_httpReqUrl",
        "type": "input",
        "valueType": "string",
        "label": "core.module.input.label.Http Request Url",
        "description": "core.module.input.description.Http Request Url",
        "placeholder": "https://api.ai.com/getInventory",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "",
        "connected": false
      },
      {
        "key": "system_httpHeader",
        "type": "textarea",
        "valueType": "string",
        "label": "core.module.input.label.Http Request Header",
        "description": "core.module.input.description.Http Request Header",
        "placeholder": "core.module.input.description.Http Request Header",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "DYNAMIC_INPUT_KEY",
        "type": "target",
        "valueType": "any",
        "label": "core.module.inputType.dynamicTargetInput",
        "description": "core.module.input.description.dynamic input",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": true,
        "hideInApp": true,
        "connected": false
      },
      {
        "key": "searchKey",
        "valueType": "string",
        "label": "搜索词",
        "type": "target",
        "required": true,
        "description": "",
        "edit": true,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "required": true,
          "dataType": true
        },
        "connected": true
      },
      {
        "key": "system_addInputParam",
        "type": "addInputParam",
        "valueType": "any",
        "label": "",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "required": true,
          "dataType": true
        },
        "defaultEditField": {
          "label": "",
          "key": "",
          "description": "",
          "inputType": "target",
          "valueType": "string",
          "required": true
        },
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "finish",
        "label": "core.module.output.label.running done",
        "description": "core.module.output.description.running done",
        "valueType": "boolean",
        "type": "source",
        "targets": []
      },
      {
        "key": "system_addOutputParam",
        "type": "addOutputParam",
        "valueType": "any",
        "label": "",
        "targets": [],
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "dataType": true
        },
        "defaultEditField": {
          "label": "",
          "key": "",
          "description": "",
          "outputType": "source",
          "valueType": "string"
        }
      },
      {
        "type": "source",
        "valueType": "string",
        "label": "搜索结果",
        "description": "",
        "edit": true,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "dataType": true
        },
        "targets": [
          {
            "moduleId": "bwhh0x",
            "key": "response"
          }
        ],
        "key": "prompt"
      }
    ]
  },
  {
    "moduleId": "r8ckxe",
    "name": "AI 对话",
    "avatar": "/imgs/module/AI.png",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2739.8508590056117,
      "y": 1804.8613188888335
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "model",
        "type": "selectChatModel",
        "label": "对话模型",
        "required": true,
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "gpt-3.5-turbo",
        "connected": false
      },
      {
        "key": "temperature",
        "type": "hidden",
        "label": "温度",
        "value": 0,
        "valueType": "number",
        "min": 0,
        "max": 10,
        "step": 1,
        "markList": [
          {
            "label": "严谨",
            "value": 0
          },
          {
            "label": "发散",
            "value": 10
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "maxToken",
        "type": "hidden",
        "label": "回复上限",
        "value": 2000,
        "valueType": "number",
        "min": 100,
        "max": 4000,
        "step": 50,
        "markList": [
          {
            "label": "100",
            "value": 100
          },
          {
            "label": "4000",
            "value": 4000
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "isResponseAnswerText",
        "type": "hidden",
        "label": "返回AI内容",
        "value": true,
        "valueType": "boolean",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "引用内容模板",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "aiSettings",
        "type": "aiSettings",
        "label": "",
        "valueType": "any",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "systemPrompt",
        "type": "textarea",
        "label": "系统提示词",
        "max": 300,
        "valueType": "string",
        "description": "模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}",
        "placeholder": "模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "history",
        "type": "numberInput",
        "label": "core.module.input.label.chat history",
        "required": true,
        "min": 0,
        "max": 30,
        "valueType": "chatHistory",
        "value": 6,
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "quoteQA",
        "type": "target",
        "label": "引用内容",
        "description": "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
        "valueType": "datasetQuote",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "userChatInput",
        "type": "target",
        "label": "core.module.input.label.user question",
        "required": true,
        "valueType": "string",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "history",
        "label": "新的上下文",
        "description": "将本次回复内容拼接上历史记录，作为新的上下文返回",
        "valueType": "chatHistory",
        "type": "source",
        "targets": []
      },
      {
        "key": "answerText",
        "label": "AI回复",
        "description": "将在 stream 回复完毕后触发",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "finish",
        "label": "core.module.output.label.running done",
        "description": "core.module.output.description.running done",
        "valueType": "boolean",
        "type": "source",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "bwhh0x",
    "name": "core.module.template.textEditor",
    "avatar": "/imgs/module/textEditor.svg",
    "flowType": "pluginModule",
    "showStatus": false,
    "position": {
      "x": 2191.3365552198184,
      "y": 2050.00737644673
    },
    "inputs": [
      {
        "key": "pluginId",
        "type": "hidden",
        "label": "pluginId",
        "value": "community-textEditor",
        "valueType": "string",
        "connected": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false
      },
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "textarea",
        "valueType": "string",
        "label": "core.module.input.label.textEditor textarea",
        "type": "textarea",
        "required": true,
        "description": "core.module.input.description.textEditor textarea",
        "edit": false,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "required": true,
          "dataType": true,
          "inputType": true
        },
        "connected": false,
        "placeholder": "core.module.input.description.textEditor textarea",
        "value": "谷歌搜索结果:\n\"\"\"\n{{response}}\n\"\"\"\n\n请根据谷歌搜索结果和历史记录来回答我的问题，遵循以下要求：\n- 使用对话的语气回答问题。\n- 不要提及你是从谷歌搜索和历史记录获取的结果。\n- 使用与问题相同的语言回答。\n\n我的问题：“{{q}}”"
      },
      {
        "key": "response",
        "valueType": "string",
        "label": "搜索结果",
        "type": "target",
        "required": true,
        "description": "",
        "edit": true,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "required": true,
          "dataType": true,
          "inputType": false
        },
        "connected": true
      },
      {
        "key": "q",
        "valueType": "string",
        "label": "问题",
        "type": "target",
        "required": true,
        "description": "",
        "edit": true,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "required": true,
          "dataType": true,
          "inputType": false
        },
        "connected": true
      },
      {
        "key": "DYNAMIC_INPUT_KEY",
        "valueType": "any",
        "label": "字符串变量",
        "type": "addInputParam",
        "required": false,
        "description": "可动态的添加字符串类型变量，在文本编辑中通过 {{key}} 使用变量。",
        "edit": false,
        "editField": {
          "key": true,
          "name": true,
          "description": true,
          "required": true,
          "dataType": true,
          "inputType": false
        },
        "defaultEditField": {
          "label": "",
          "key": "",
          "description": "",
          "inputType": "target",
          "valueType": "string",
          "required": true
        },
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "text",
        "valueType": "string",
        "label": "core.module.output.label.text",
        "type": "source",
        "edit": false,
        "targets": [
          {
            "moduleId": "r8ckxe",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "lxubmw",
    "name": "用户问题(入口)",
    "avatar": "/imgs/module/userChatInput.png",
    "flowType": "questionInput",
    "position": {
      "x": 1756.2023030545522,
      "y": 2638.357914585682
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "valueType": "string",
        "label": "用户问题",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "用户问题",
        "type": "source",
        "valueType": "string",
        "targets": [
          {
            "moduleId": "bwhh0x",
            "key": "q"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "se8tz2",
    "name": "用户问题(对话入口)",
    "avatar": "/imgs/module/userChatInput.png",
    "flowType": "questionInput",
    "position": {
      "x": 1265.7020997254251,
      "y": 1651.8948902038671
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "valueType": "string",
        "label": "用户问题",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "用户问题",
        "type": "source",
        "valueType": "string",
        "targets": [
          {
            "moduleId": "5jtdwx",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "5jtdwx",
    "name": "AI 对话",
    "avatar": "/imgs/module/AI.png",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 1589.1965513432344,
      "y": 1018.248906699934
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      },
      {
        "key": "model",
        "type": "selectChatModel",
        "label": "对话模型",
        "required": true,
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "gpt-3.5-turbo",
        "connected": false
      },
      {
        "key": "temperature",
        "type": "hidden",
        "label": "温度",
        "value": 0,
        "valueType": "number",
        "min": 0,
        "max": 10,
        "step": 1,
        "markList": [
          {
            "label": "严谨",
            "value": 0
          },
          {
            "label": "发散",
            "value": 10
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "maxToken",
        "type": "hidden",
        "label": "回复上限",
        "value": 2000,
        "valueType": "number",
        "min": 100,
        "max": 4000,
        "step": 50,
        "markList": [
          {
            "label": "100",
            "value": 100
          },
          {
            "label": "4000",
            "value": 4000
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "isResponseAnswerText",
        "type": "hidden",
        "label": "返回AI内容",
        "value": true,
        "valueType": "boolean",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "引用内容模板",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "aiSettings",
        "type": "aiSettings",
        "label": "",
        "valueType": "any",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "systemPrompt",
        "type": "textarea",
        "label": "系统提示词",
        "max": 300,
        "valueType": "string",
        "description": "模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}",
        "placeholder": "模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "history",
        "type": "numberInput",
        "label": "core.module.input.label.chat history",
        "required": true,
        "min": 0,
        "max": 30,
        "valueType": "chatHistory",
        "value": 6,
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "quoteQA",
        "type": "target",
        "label": "引用内容",
        "description": "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
        "valueType": "datasetQuote",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "userChatInput",
        "type": "target",
        "label": "core.module.input.label.user question",
        "required": true,
        "valueType": "string",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "history",
        "label": "新的上下文",
        "description": "将本次回复内容拼接上历史记录，作为新的上下文返回",
        "valueType": "chatHistory",
        "type": "source",
        "targets": []
      },
      {
        "key": "answerText",
        "label": "AI回复",
        "description": "将在 stream 回复完毕后触发",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "finish",
        "label": "core.module.output.label.running done",
        "description": "core.module.output.description.running done",
        "valueType": "boolean",
        "type": "source",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "p9h459",
    "name": "core.module.template.cfr",
    "avatar": "/imgs/module/cfr.svg",
    "flowType": "cfr",
    "showStatus": true,
    "position": {
      "x": 184.26897486756246,
      "y": 1372.7983698162132
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "model",
        "type": "selectExtractModel",
        "label": "core.module.input.label.aiModel",
        "required": true,
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "gpt-4",
        "connected": false
      },
      {
        "key": "systemPrompt",
        "type": "textarea",
        "label": "core.module.input.label.cfr background",
        "max": 300,
        "valueType": "string",
        "description": "core.module.input.description.cfr background",
        "placeholder": "core.module.input.placeholder.cfr background",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "value": "",
        "connected": false
      },
      {
        "key": "history",
        "type": "numberInput",
        "label": "core.module.input.label.chat history",
        "required": true,
        "min": 0,
        "max": 30,
        "valueType": "chatHistory",
        "value": 6,
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "userChatInput",
        "type": "target",
        "label": "core.module.input.label.user question",
        "required": true,
        "valueType": "string",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "system_text",
        "label": "core.module.output.label.cfr result",
        "valueType": "string",
        "type": "source",
        "targets": [
          {
            "moduleId": "6g2075",
            "key": "content"
          }
        ]
      }
    ]
  }
]
```

{{% /details %}}

## 流程说明

1. 利用【问题补全】模块，优化用户的问题，明确主体对象。
2. 利用【内容提取】模块，将用户的问题提取成搜索关键词。
3. 将搜索关键词传入【HTTP模块】，执行谷歌搜索。
4. 利用【文本编辑模块】组合搜索结果和问题，生成一个适合模型回答的问题。
5. 将新的问题发给【AI模块】，回答搜索结果。
