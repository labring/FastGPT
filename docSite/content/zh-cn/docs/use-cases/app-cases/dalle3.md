---
title: 'Dalle3 绘图'
description: '使用 HTTP 模块绘制图片'
icon: 'image'
draft: false
toc: true
weight: 614
---

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/demo-dalle1.webp) | ![](/imgs/demo-dalle2.webp) |

## OpenAI Dalle3 接口

先来看下官方接口的参数和响应值：

Body

```json
{
    "model": "dall-e-3",
    "prompt": "A cute baby sea otter",
    "n": 1,
    "size": "1024x1024"
}
```

Response 

```json
{
  "created": 1589478378,
  "data": [
    {
      "url": "https://..."
    },
    {
      "url": "https://..."
    }
  ]
}
```

## 编排思路

1. 通过 AI 来优化图片绘制的提示词（这步省略了，自己找提示词即可）
2. 通过 `【HTTP 请求】模块` 调用 Dalle3 接口，获取图片的 URL。
3. 通过 `【文本加工】模块` 来构建 `Markdown` 的图片格式。
4. 通过 `【指定回复】模块` 来直接输出图片链接。

### 1. 构建 HTTP 模块

请求参数直接复制 Dalle3 接口的即可，并求改 prompt 为变量。需要增加一个 `Headers.Authorization` 。

Body:

```json
{
    "model": "dall-e-3",
    "prompt": "{{prompt}}",
    "n": 1,
    "size": "1024x1024"
}
```

Headers:

`Authorization: Bearer sk-xxx`

Response:

响应值需要根据 Dalle3 接口的返回值进行获取，我们只绘制了1张图片，所以只需要取第一张图片的 URL 即可。给 HTTP 模块增加一个自定义输出 `data[0].url` 。

### 2. 文本加工 - 构建图片链接

在 `Markdown` 语法中 `![图片描述](图片链接)` 表示插入图片，图片链接由【HTTP 请求】模块输出。

因此可以增加一个输入来接收 `【HTTP 请求】模块` 的图片链接输出，并在 `【文本加工】模块 - 文本` 中通过变量来引用图片链接，从而得到一个完整的 `Markdown` 图片格式。

### 3. 指定回复

指定回复可以直接输出传入的内容到客户端，因此可以直接输出加工好的 `Markdown` 图片格式即可。

## 编排代码

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
        "x": 531.2422736065552,
        "y": -486.7611729549753
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
        "x": 532.1275542407774,
        "y": 46.03775600322817
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
      "nodeId": "tMyUnRL5jIrC",
      "name": "HTTP 请求",
      "intro": "可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）",
      "avatar": "/imgs/workflow/http.png",
      "flowNodeType": "httpRequest468",
      "showStatus": true,
      "position": {
        "x": 921.2377506442713,
        "y": -483.94114977914256
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
          "key": "prompt",
          "valueType": "string",
          "label": "prompt",
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
            "448745",
            "userChatInput"
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
          "value": "https://api.openai.com/v1/images/generations"
        },
        {
          "key": "system_httpHeader",
          "renderTypeList": [
            "custom"
          ],
          "valueType": "any",
          "value": [
            {
              "key": "Authorization",
              "type": "string",
              "value": "Bearer "
            }
          ],
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
          "value": "{\n  \"model\": \"dall-e-3\",\n  \"prompt\": \"{{prompt}}\",\n  \"n\": 1,\n  \"size\": \"1024x1024\"\n}",
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
          "id": "DeKGGioBwaMf",
          "type": "dynamic",
          "key": "data[0].url",
          "valueType": "string",
          "label": "data[0].url"
        }
      ]
    },
    {
      "nodeId": "CO3POL8svbbi",
      "name": "文本加工",
      "intro": "可对固定或传入的文本进行加工后输出，非字符串类型数据最终会转成字符串类型。",
      "avatar": "/imgs/workflow/textEditor.svg",
      "flowNodeType": "pluginModule",
      "showStatus": false,
      "position": {
        "x": 1417.5940290051137,
        "y": -478.81889618104356
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
          "key": "url",
          "valueType": "string",
          "label": "url",
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
            "tMyUnRL5jIrC",
            "DeKGGioBwaMf"
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
          "value": "![]({{url}})",
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
      "nodeId": "7mapnCgHfKW6",
      "name": "指定回复",
      "intro": "该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。",
      "avatar": "/imgs/workflow/reply.png",
      "flowNodeType": "answerNode",
      "position": {
        "x": 1922.5628399315042,
        "y": -471.67391598231796
      },
      "inputs": [
        {
          "key": "text",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "valueType": "string",
          "label": "core.module.input.label.Response content",
          "description": "core.module.input.description.Response content",
          "placeholder": "core.module.input.description.Response content",
          "selectedTypeIndex": 1,
          "value": [
            "CO3POL8svbbi",
            "text"
          ]
        }
      ],
      "outputs": []
    }
  ],
  "edges": [
    {
      "source": "448745",
      "target": "tMyUnRL5jIrC",
      "sourceHandle": "448745-source-right",
      "targetHandle": "tMyUnRL5jIrC-target-left"
    },
    {
      "source": "tMyUnRL5jIrC",
      "target": "CO3POL8svbbi",
      "sourceHandle": "tMyUnRL5jIrC-source-right",
      "targetHandle": "CO3POL8svbbi-target-left"
    },
    {
      "source": "CO3POL8svbbi",
      "target": "7mapnCgHfKW6",
      "sourceHandle": "CO3POL8svbbi-source-right",
      "targetHandle": "7mapnCgHfKW6-target-left"
    }
  ]
}
```

{{% /details %}}
