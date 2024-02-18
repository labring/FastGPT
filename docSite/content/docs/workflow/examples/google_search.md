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

## 模块编排

复制下面配置，点击「高级编排」右上角的导入按键，导入该配置，导入后将接口地址复制到「HTTP 模块」。

{{% details title="编排配置" closed="true" %}}

```json
[
  {
    "moduleId": "userChatInput",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 200.0300839741032,
      "y": 1641.7311245570252
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "valueType": "string",
        "label": "core.module.input.label.user question",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "core.module.input.label.user question",
        "type": "source",
        "valueType": "string",
        "targets": [
          {
            "moduleId": "6g2075",
            "key": "content"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "6g2075",
    "name": "文本内容提取",
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
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "model",
        "type": "selectExtractModel",
        "valueType": "string",
        "label": "core.module.input.label.LLM",
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
        "description": "给AI一些对应的背景知识或要求描述，引导AI更好的完成任务。\n该输入框可使用全局变量。",
        "required": true,
        "placeholder": "例如: \n1. 当前时间为: {{cTime}}。你是一个实验室预约助手，你的任务是帮助用户预约实验室，从文本中获取对应的预约信息。\n2. 你是谷歌搜索助手，需要从文本中提取出合适的搜索词。",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "value": "你是谷歌搜索机器人，根据当前问题和对话记录生成搜索词。\n你需要自行判断是否需要进行网络实时查询：\n- 如果需查询则生成搜索词。\n- 如果不需要查询则不返回该字段。",
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
            "moduleId": "zakgqt",
            "key": "prompt"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "r8ckxe",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2886.1033536393606,
      "y": 1867.5409594461544
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "model",
        "type": "selectChatModel",
        "label": "core.module.input.label.aiModel",
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
        "label": "",
        "value": 0,
        "valueType": "number",
        "min": 0,
        "max": 10,
        "step": 1,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "maxToken",
        "type": "hidden",
        "label": "",
        "value": 2000,
        "valueType": "number",
        "min": 100,
        "max": 4000,
        "step": 50,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "isResponseAnswerText",
        "type": "hidden",
        "label": "",
        "value": true,
        "valueType": "boolean",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "",
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
        "label": "core.ai.Prompt",
        "max": 300,
        "valueType": "string",
        "description": "core.app.tip.chatNodeSystemPromptTip",
        "placeholder": "core.app.tip.chatNodeSystemPromptTip",
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
        "key": "userChatInput",
        "type": "custom",
        "label": "",
        "required": true,
        "valueType": "string",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      },
      {
        "key": "quoteQA",
        "type": "target",
        "label": "知识库引用",
        "description": "core.module.Dataset quote.Input description",
        "valueType": "datasetQuote",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "history",
        "label": "core.module.output.label.New context",
        "description": "core.module.output.description.New context",
        "valueType": "chatHistory",
        "type": "source",
        "targets": []
      },
      {
        "key": "answerText",
        "label": "core.module.output.label.Ai response content",
        "description": "core.module.output.description.Ai response content",
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
      },
      {
        "key": "userChatInput",
        "label": "core.module.input.label.user question",
        "type": "hidden",
        "valueType": "string",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "bwhh0x",
    "name": "core.module.template.textEditor",
    "flowType": "pluginModule",
    "showStatus": false,
    "position": {
      "x": 2323.6602408408294,
      "y": 2087.8175338140313
    },
    "inputs": [
      {
        "key": "pluginId",
        "type": "hidden",
        "label": "",
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
        "description": "core.module.input.description.Trigger",
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
        "value": "请使用下面<data></data>中的数据作为你的知识。请直接输出答案，不要提及你是从<data></data>中获取的知识。\n\n当前时间: {{cTime}}\n\n<data>\n{{response}}\n</data>\n\n我的问题：“{{q}}”"
      },
      {
        "key": "response",
        "valueType": "string",
        "label": "response",
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
        "label": "q",
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
        "label": "需要加工的输入",
        "type": "addInputParam",
        "required": false,
        "description": "可动态的添加字符串类型变量，在文本编辑中通过 {{key}} 使用变量。非字符串类型，会自动转成字符串类型。",
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
    "flowType": "questionInput",
    "position": {
      "x": 1744.5949622106039,
      "y": 2767.1993979535087
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "valueType": "string",
        "label": "core.module.input.label.user question",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "core.module.input.label.user question",
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
    "flowType": "questionInput",
    "position": {
      "x": 1258.737695219056,
      "y": 1282.7814513663104
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "valueType": "string",
        "label": "core.module.input.label.user question",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "core.module.input.label.user question",
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
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 1709.9128961202969,
      "y": 943.9619252986647
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      },
      {
        "key": "model",
        "type": "selectChatModel",
        "label": "core.module.input.label.aiModel",
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
        "label": "",
        "value": 0,
        "valueType": "number",
        "min": 0,
        "max": 10,
        "step": 1,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "maxToken",
        "type": "hidden",
        "label": "",
        "value": 2000,
        "valueType": "number",
        "min": 100,
        "max": 4000,
        "step": 50,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "isResponseAnswerText",
        "type": "hidden",
        "label": "",
        "value": true,
        "valueType": "boolean",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "",
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
        "label": "core.ai.Prompt",
        "max": 300,
        "valueType": "string",
        "description": "core.app.tip.chatNodeSystemPromptTip",
        "placeholder": "core.app.tip.chatNodeSystemPromptTip",
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
        "key": "userChatInput",
        "type": "custom",
        "label": "",
        "required": true,
        "valueType": "string",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      },
      {
        "key": "quoteQA",
        "type": "target",
        "label": "知识库引用",
        "description": "core.module.Dataset quote.Input description",
        "valueType": "datasetQuote",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "history",
        "label": "core.module.output.label.New context",
        "description": "core.module.output.description.New context",
        "valueType": "chatHistory",
        "type": "source",
        "targets": []
      },
      {
        "key": "answerText",
        "label": "core.module.output.label.Ai response content",
        "description": "core.module.output.description.Ai response content",
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
      },
      {
        "key": "userChatInput",
        "label": "core.module.input.label.user question",
        "type": "hidden",
        "valueType": "string",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "zakgqt",
    "name": "core.module.template.Http request",
    "flowType": "httpRequest468",
    "showStatus": true,
    "position": {
      "x": 1596.0994578513428,
      "y": 1862.086836404846
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "core.module.input.label.switch",
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "system_httpMethod",
        "type": "custom",
        "valueType": "string",
        "label": "",
        "value": "POST",
        "required": true,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "system_httpReqUrl",
        "type": "hidden",
        "valueType": "string",
        "label": "",
        "description": "core.module.input.description.Http Request Url",
        "placeholder": "https://api.ai.com/getInventory",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "https://d8dns0.laf.dev/google_earch",
        "connected": false
      },
      {
        "key": "system_httpHeader",
        "type": "custom",
        "valueType": "any",
        "value": [],
        "label": "",
        "description": "core.module.input.description.Http Request Header",
        "placeholder": "core.module.input.description.Http Request Header",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "system_httpParams",
        "type": "hidden",
        "valueType": "any",
        "value": [],
        "label": "",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "system_httpJsonBody",
        "type": "hidden",
        "valueType": "any",
        "value": "{\r\n  \"searchKey\": \"{{prompt}}\"\r\n}",
        "label": "",
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
        "key": "prompt",
        "valueType": "string",
        "label": "prompt",
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
        "key": "prompt",
        "label": "prompt",
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
        ]
      }
    ]
  }
]
```

{{% /details %}}

## 流程说明

1. 利用【内容提取】模块，将用户的问题提取成搜索关键词。
2. 将搜索关键词传入【HTTP模块】，执行谷歌搜索。
3. 利用【文本编辑模块】组合搜索结果和问题，生成一个适合模型回答的问题。
4. 将新的问题发给【AI模块】，回答搜索结果。
