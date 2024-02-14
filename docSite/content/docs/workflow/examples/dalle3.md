---
title: 'Dalle3 绘图'
description: '使用 HTTP 模块绘制图片'
icon: 'image'
draft: false
toc: true
weight: 404
---

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/demo-dalle1.png) | ![](/imgs/demo-dalle2.png) |

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

1. 通过 AI 来优化图片绘制的提示词（这部省略了，自己找提示词即可）
2. 通过`HTTP 模块`调用 Dalle3 接口，获取图片的 URL。
3. 通过`文本加工`来构建`Markdown`的图片格式。
4. 通过`指定回复`来直接输出图片链接。

### 1. 构建 HTTP 模块

请求参数直接复制 Dalle3 接口的即可，并求改 prompt 为变量。需要增加一个`Headers.Authorization`。

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

`Authorization: sk-xxx`

Response:

响应值需要根据Dalle3接口的返回值进行获取，我们只绘制了1张图片，所以只需要取第一张图片的URL即可。给 HTTP 模块增加一个`key`为`data[0].url`的输出值。

### 2. 文本加工 - 构建图片链接

在`Markdown`语法中`![图片描述](图片链接)`表示插入图片，图片链接由`HTTP模块`输出。

因此可以增加一个输入来接收`HTTP模块`的图片链接输出，并在`文本内容`中通过变量来引用图片链接，从而得到一个完整的`Markdown`图片格式。

### 3. 指定回复

指定回复可以直接输出传入的内容到客户端，因此可以直接输出加工好的`Markdown`图片格式即可。

## 编排代码

```json
[
  {
    "moduleId": "userGuide",
    "name": "core.module.template.User guide",
    "flowType": "userGuide",
    "position": {
      "x": 454.98510354678695,
      "y": 721.4016845336229
    },
    "inputs": [
      {
        "key": "welcomeText",
        "type": "hidden",
        "valueType": "string",
        "label": "core.app.Welcome Text",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "variables",
        "type": "hidden",
        "valueType": "any",
        "label": "core.module.Variable",
        "value": [],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "questionGuide",
        "valueType": "boolean",
        "type": "switch",
        "label": "",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "tts",
        "type": "hidden",
        "valueType": "any",
        "label": "",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": []
  },
  {
    "moduleId": "userChatInput",
    "name": "core.module.template.Chat entrance",
    "flowType": "questionInput",
    "position": {
      "x": 597.8136543694757,
      "y": 1709.9244174501202
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
            "moduleId": "mqgfub",
            "key": "prompt"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "mqgfub",
    "name": "Dalle3绘图",
    "flowType": "httpRequest468",
    "showStatus": true,
    "position": {
      "x": 1071.8956245626034,
      "y": 1236.690825267034
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
        "value": "https://api.openai.com/v1/images/generations",
        "connected": false
      },
      {
        "key": "system_httpHeader",
        "type": "custom",
        "valueType": "any",
        "value": [
          {
            "key": "Authorization",
            "type": "string",
            "value": "sk-xxx"
          }
        ],
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
        "value": "{\r\n    \"model\": \"dall-e-3\",\r\n    \"prompt\": \"{{prompt}}\",\r\n    \"n\": 1,\r\n    \"size\": \"1024x1024\"\r\n  }",
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
        "key": "data[0].url",
        "label": "url",
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
            "moduleId": "nl6mr9",
            "key": "url"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "xy76o2",
    "name": "core.module.template.Assigned reply",
    "flowType": "answerNode",
    "position": {
      "x": 2204.027057268489,
      "y": 1256.786345213533
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
        "key": "text",
        "type": "textarea",
        "valueType": "any",
        "label": "core.module.input.label.Response content",
        "description": "core.module.input.description.Response content",
        "placeholder": "core.module.input.description.Response content",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
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
      }
    ]
  },
  {
    "moduleId": "nl6mr9",
    "name": "core.module.template.textEditor",
    "flowType": "pluginModule",
    "showStatus": false,
    "position": {
      "x": 1690.1826860670342,
      "y": 1262.3858719789062
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
        "label": "文本内容",
        "type": "textarea",
        "required": true,
        "description": "可以通过 {{key}} 的方式引用传入的变量。变量仅支持字符串或数字。",
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
        "placeholder": "可以通过 {{key}} 的方式引用传入的变量。变量仅支持字符串或数字。",
        "value": "![]({{url}})"
      },
      {
        "key": "url",
        "valueType": "string",
        "label": "url",
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
            "moduleId": "xy76o2",
            "key": "text"
          }
        ]
      }
    ]
  }
]
```