---
title: '实验室预约'
description: '展示高级编排操作数据库的能力'
icon: 'database'
draft: false
toc: true
weight: 612
---

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/demo-appointment1.webp) | ![](/imgs/demo-appointment2.webp) |
| ![](/imgs/demo-appointment3.webp) | ![](/imgs/demo-appointment4.webp) |



本示例演示了利用工具调用，自动选择调用知识库搜索实验室相关内容，或调用 HTTP 模块实现数据库的 CRUD 操作。

以一个实验室预约为例，用户可以通过对话系统预约、取消、修改预约和查询预约记录。

## 1. 全局变量使用

通过设计一个全局变量，让用户输入姓名，模拟用户身份信息。实际使用过程中，通常是直接通过嵌入 Token 来标记用户身份。

## 2. 工具调用

![](/imgs/demo-appointment5.png)

背景知识中，引导模型调用工具去执行不通的操作。

{{% alert icon="🤗" context="warning" %}}
**Tips:** 这里需要增加适当的上下文，方便模型结合历史纪录进行判断和决策~
{{% /alert %}}

## 3. HTTP 模块

![](/imgs/demo-appointment6.jpg)

HTTP模块中，需要设置 3 个工具参数：

- 预约行为：可取 get, put, post, delete 四个值，分别对应查询、修改、新增、删除操作。当然，你也可以写4个HTTP模块，来分别处理。
- labname: 实验室名。非必填，因为查询和删除时候，不需要。
- time: 预约时间。


# 总结

1. 工具调用模块是非常强大的功能，可以在一定程度上替代问题分类和内容提取。
2. 通过工具模块，动态的调用不同的工具，可以将复杂业务解耦。


# 附件

## 编排配置

可直接复制，导入到 FastGPT 中。

{{% details title="编排配置" closed="true" %}}

```json
{
  "nodes": [
    {
      "nodeId": "userChatInput",
      "name": "流程开始",
      "intro": "当用户发送一个内容后，流程将会从这个模块开始执行。",
      "avatar": "/imgs/workflow/userChatInput.svg",
      "flowNodeType": "workflowStart",
      "position": {
        "x": 309.7143912167367,
        "y": 1501.2761754220846
      },
      "inputs": [
        {
          "key": "userChatInput",
          "renderTypeList": [
            "reference",
            "textarea"
          ],
          "valueType": "string",
          "label": "问题输入",
          "required": true,
          "toolDescription": "用户问题",
          "type": "systemInput",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0,
          "value": [
            "userChatInput",
            "userChatInput"
          ]
        }
      ],
      "outputs": [
        {
          "id": "userChatInput",
          "type": "static",
          "key": "userChatInput",
          "valueType": "string",
          "label": "core.module.input.label.user question"
        }
      ]
    },
    {
      "nodeId": "eg5upi",
      "name": "指定回复",
      "intro": "该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。",
      "avatar": "/imgs/workflow/reply.png",
      "flowNodeType": "answerNode",
      "position": {
        "x": 1962.729630445213,
        "y": 2295.9791334948304
      },
      "inputs": [
        {
          "key": "text",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "valueType": "any",
          "label": "core.module.input.label.Response content",
          "description": "core.module.input.description.Response content",
          "placeholder": "core.module.input.description.Response content",
          "type": "textarea",
          "showTargetInApp": true,
          "showTargetInPlugin": true,
          "connected": true,
          "selectedTypeIndex": 1,
          "value": [
            "40clf3",
            "result"
          ]
        }
      ],
      "outputs": []
    },
    {
      "nodeId": "kge59i",
      "name": "用户引导",
      "intro": "可以配置应用的系统参数。",
      "avatar": "/imgs/workflow/userGuide.png",
      "flowNodeType": "userGuide",
      "position": {
        "x": -327.218389965887,
        "y": 1504.8056414948464
      },
      "inputs": [
        {
          "key": "welcomeText",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "string",
          "label": "core.app.Welcome Text",
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "value": "你好，我是实验室助手，请问有什么可以帮助你的么？如需预约或修改预约实验室，请提供姓名、时间和实验室名称。\n[实验室介绍]\n[开放时间]\n[预约]",
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "variables",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "core.module.Variable",
          "value": [
            {
              "id": "gt9b23",
              "key": "name",
              "label": "name",
              "type": "input",
              "required": true,
              "maxLen": 50,
              "enums": [
                {
                  "value": ""
                }
              ]
            }
          ],
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "questionGuide",
          "valueType": "boolean",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "type": "switch",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "value": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "tts",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "value": {
            "type": "model",
            "model": "tts-1",
            "voice": "alloy"
          },
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "whisper",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": "",
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
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
      "nodeId": "40clf3",
      "name": "HTTP请求",
      "intro": "可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）",
      "avatar": "/imgs/workflow/http.png",
      "flowNodeType": "httpRequest468",
      "showStatus": true,
      "position": {
        "x": 1118.6532653446993,
        "y": 1955.886106913907
      },
      "inputs": [
        {
          "key": "system_httpMethod",
          "renderTypeList": [
            "custom"
          ],
          "valueType": "string",
          "label": "",
          "value": "POST",
          "required": true,
          "type": "custom",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "valueType": "string",
          "renderTypeList": [
            "reference"
          ],
          "key": "action",
          "label": "action",
          "toolDescription": "预约行为，一共四种：\nget - 查询预约情况\nput - 更新预约\npost - 新增预约\ndelete - 删除预约",
          "required": true,
          "canEdit": true,
          "editField": {
            "key": true,
            "description": true
          }
        },
        {
          "valueType": "string",
          "renderTypeList": [
            "reference"
          ],
          "key": "labname",
          "label": "labname",
          "toolDescription": "实验室名称",
          "required": false,
          "canEdit": true,
          "editField": {
            "key": true,
            "description": true
          }
        },
        {
          "valueType": "string",
          "renderTypeList": [
            "reference"
          ],
          "key": "time",
          "label": "time",
          "toolDescription": "预约时间，按 YYYY/MM/DD HH:mm 格式返回",
          "required": false,
          "canEdit": true,
          "editField": {
            "key": true,
            "description": true
          }
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
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "value": "https://d8dns0.laf.dev/appointment-lab",
          "connected": false,
          "selectedTypeIndex": 0
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
          "required": false,
          "type": "custom",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "system_httpParams",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "value": [],
          "label": "",
          "required": false,
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "system_httpJsonBody",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "value": "{\r\n  \"name\": \"{{name}}\",\r\n  \"time\": \"{{time}}\",\r\n  \"labname\": \"{{labname}}\",\r\n  \"action\": \"{{action}}\"\r\n}",
          "label": "",
          "required": false,
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
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
          "type": "dynamic",
          "key": "system_addOutputParam",
          "valueType": "dynamic",
          "label": "",
          "editField": {
            "key": true,
            "valueType": true
          }
        },
        {
          "id": "result",
          "type": "static",
          "key": "result",
          "valueType": "string",
          "label": "result",
          "description": "result",
          "canEdit": true,
          "editField": {
            "key": true,
            "name": true,
            "description": true,
            "dataType": true
          }
        },
        {
          "id": "httpRawResponse",
          "type": "static",
          "key": "httpRawResponse",
          "valueType": "any",
          "label": "原始响应",
          "description": "HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。"
        }
      ]
    },
    {
      "nodeId": "fYxwWym8flYL",
      "name": "工具调用",
      "intro": "通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。",
      "avatar": "/imgs/workflow/tool.svg",
      "flowNodeType": "tools",
      "showStatus": true,
      "position": {
        "x": 933.9342354248961,
        "y": 1229.3563445150553
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
          "value": "当前时间为: {{cTime}}\n你是实验室助手，用户可能会询问实验室相关介绍或预约实验室。\n请选择合适的工具去帮助他们。"
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
            "userChatInput",
            "userChatInput"
          ]
        }
      ],
      "outputs": []
    },
    {
      "nodeId": "JSSQtDgwmmbE",
      "name": "知识库搜索",
      "intro": "调用“语义检索”和“全文检索”能力，从“知识库”中查找实验室介绍和使用规则等信息。",
      "avatar": "/imgs/workflow/db.png",
      "flowNodeType": "datasetSearchNode",
      "showStatus": true,
      "position": {
        "x": 447.0795498711184,
        "y": 1971.5311041711186
      },
      "inputs": [
        {
          "key": "datasets",
          "renderTypeList": [
            "selectDataset",
            "reference"
          ],
          "label": "core.module.input.label.Select dataset",
          "value": [],
          "valueType": "selectDataset",
          "list": [],
          "required": true
        },
        {
          "key": "similarity",
          "renderTypeList": [
            "selectDatasetParamsModal"
          ],
          "label": "",
          "value": 0.4,
          "valueType": "number"
        },
        {
          "key": "limit",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": 1500,
          "valueType": "number"
        },
        {
          "key": "searchMode",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string",
          "value": "embedding"
        },
        {
          "key": "usingReRank",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "boolean",
          "value": false
        },
        {
          "key": "datasetSearchUsingExtensionQuery",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "boolean",
          "value": false
        },
        {
          "key": "datasetSearchExtensionModel",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string",
          "value": "gpt-3.5-turbo"
        },
        {
          "key": "datasetSearchExtensionBg",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string",
          "value": ""
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
          "toolDescription": "需要检索的内容"
        }
      ],
      "outputs": [
        {
          "id": "quoteQA",
          "key": "quoteQA",
          "label": "core.module.Dataset quote.label",
          "description": "特殊数组格式，搜索结果为空时，返回空数组。",
          "type": "static",
          "valueType": "datasetQuote"
        }
      ]
    },
    {
      "nodeId": "IdntVQiTopHT",
      "name": "工具调用终止",
      "intro": "该模块需配置工具调用使用。当该模块被执行时，本次工具调用将会强制结束，并且不再调用AI针对工具调用结果回答问题。",
      "avatar": "/imgs/workflow/toolStop.svg",
      "flowNodeType": "stopTool",
      "position": {
        "x": 1969.73331750207,
        "y": 2650.0258908119413
      },
      "inputs": [],
      "outputs": []
    }
  ],
  "edges": [
    {
      "source": "40clf3",
      "target": "eg5upi",
      "sourceHandle": "40clf3-source-right",
      "targetHandle": "eg5upi-target-left"
    },
    {
      "source": "userChatInput",
      "target": "fYxwWym8flYL",
      "sourceHandle": "userChatInput-source-right",
      "targetHandle": "fYxwWym8flYL-target-left"
    },
    {
      "source": "fYxwWym8flYL",
      "target": "40clf3",
      "sourceHandle": "selectedTools",
      "targetHandle": "selectedTools"
    },
    {
      "source": "fYxwWym8flYL",
      "target": "JSSQtDgwmmbE",
      "sourceHandle": "selectedTools",
      "targetHandle": "selectedTools"
    },
    {
      "source": "40clf3",
      "target": "IdntVQiTopHT",
      "sourceHandle": "40clf3-source-right",
      "targetHandle": "IdntVQiTopHT-target-left"
    }
  ]
}
```

{{% /details %}}

## Laf 云函数代码

可以在 [Laf](https://laf.dev/) 中快速构建 HTTP 接口。

{{% details title="函数代码" closed="true" %}}

```ts
import cloud from '@lafjs/cloud'
const db = cloud.database()

type RequestType = {
    name: string;
    time?: string;
    labname?: string;
    action: 'post' | 'delete' | 'put' | 'get'
}

export default async function (ctx: FunctionContext) {
  try {
    const {   action,...body  } = ctx.body as RequestType

    if (action === 'get') {
      return await getRecord(ctx.body)
    }
    if (action === 'post') {
      return await createRecord(ctx.body)
    }
    if (action === 'put') {
      return await putRecord(ctx.body)
    }
    if (action === 'delete') {
      return await removeRecord(ctx.body)
    }


    return {
      result: "异常"
    }
  } catch (err) {
    return {
      result: "异常"
    }
  }
}

async function putRecord({ name, time, labname }: RequestType) {
  const missData = []
  if (!name) missData.push("你的姓名")

  if (missData.length > 0) {
    return {
      result: `请提供: ${missData.join("、")}`
    }
  }

  const { data: record } = await db.collection("LabAppointment").where({
    name, status: "unStart"
  }).getOne()

  if (!record) {
    return {
      result: `${name} 还没有预约记录`
    }
  }

  const updateWhere = {
    name,
    time: time || record.time,
    labname: labname || record.labname
  }

  await db.collection("LabAppointment").where({
    name, status: "unStart"
  }).update(updateWhere)

  return {
    result: `修改预约成功。
  姓名：${name}·
  时间: ${updateWhere.time}
  实验室名: ${updateWhere.labname}
  ` }
}


async function getRecord({ name }: RequestType) {
  if (!name) {
    return {
      result: "请提供你的姓名"
    }
  }
  const { data } = await db.collection('LabAppointment').where({ name, status: "unStart" }).getOne()

  if (!data) {
    return {
      result: `${name} 没有预约中的记录`
    }
  }
  return {
    result: `${name} 有一条预约记录：
姓名：${data.name}
时间: ${data.time}
实验室名: ${data.labname}
    `
  }
}

async function removeRecord({ name }: RequestType) {
  if (!name) {
    return {
      result: "请提供你的姓名"
    }
  }
  const { deleted } = await db.collection('LabAppointment').where({ name, status: "unStart" }).remove()

  if (deleted > 0) {
    return {
      result: `取消预约记录成功: ${name}`
    }
  }
  return {
    result: ` ${name} 没有预约中的记录`
  }
}

async function createRecord({ name, time, labname }: RequestType) {
  const missData = []
  if (!name) missData.push("你的姓名")
  if (!time) missData.push("需要预约的时间")
  if (!labname) missData.push("实验室名名称")

  if (missData.length > 0) {
    return {
      result: `请提供: ${missData.join("、")}`
    }
  }

  const { data: record } = await db.collection("LabAppointment").where({
    name, status: "unStart"
  }).getOne()

  if (record) {
    return {
      result: `您已经有一个预约记录了:
姓名：${record.name}
时间: ${record.time}
实验室名: ${record.labname}

每人仅能同时预约一个实验室名。
      `
    }
  }

  await db.collection("LabAppointment").add({
    name, time, labname, status: "unStart"
  })

  return {
    result: `预约成功。
  姓名：${name}
  时间: ${time}
  实验室名: ${labname}
  ` }
}
```

{{% /details %}}
