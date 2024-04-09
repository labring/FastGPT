---
title: '发送飞书webhook通知'
description: '利用工具调用模块，发送一个飞书webhook通知'
icon: 'image'
draft: false
toc: true
weight: 404
---

该文章展示如何发送一个简单的飞书webhook通知，以此类推，发送其他类型的通知也可以这么操作。

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/feishuwebhook1.png) | ![](/imgs/feishuwebhook2.webp) |

## 1. 准备飞书机器人

|                       |                       | |
| --------------------- | --------------------- |--------------------- |
| ![](/imgs/feishuwebhook3.png) | ![](/imgs/feishuwebhook4.webp) |![](/imgs/feishuwebhook5.png) |

## 2. 导入编排代码

复制下面配置，点击「高级编排」右上角的导入按键，导入该配置，导入后将飞书提供的接口地址复制到「HTTP 模块」。

```json
[
  {
    "moduleId": "userGuide",
    "name": "core.module.template.App system setting",
    "intro": "core.app.tip.userGuideTip",
    "avatar": "/imgs/module/userGuide.png",
    "flowType": "userGuide",
    "position": {
      "x": -92.26884681344463,
      "y": 710.9354029649536
    },
    "inputs": [
      {
        "key": "welcomeText",
        "type": "hidden",
        "valueType": "string",
        "label": "core.app.Welcome Text",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "",
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
        "value": false,
        "connected": false
      },
      {
        "key": "tts",
        "type": "hidden",
        "valueType": "any",
        "label": "",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": {
          "type": "web"
        },
        "connected": false
      }
    ],
    "outputs": []
  },
  {
    "moduleId": "userChatInput",
    "name": "core.module.template.Chat entrance",
    "intro": "当用户发送一个内容后，流程将会从这个模块开始执行。",
    "avatar": "/imgs/module/userChatInput.svg",
    "flowType": "questionInput",
    "position": {
      "x": 241.60980819261408,
      "y": 1330.9528898009685
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
            "moduleId": "n84rvg",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "n84rvg",
    "name": "工具调用（实验）",
    "intro": "通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。",
    "avatar": "/imgs/module/tool.svg",
    "flowType": "tools",
    "showStatus": true,
    "position": {
      "x": 809.4264785615641,
      "y": 873.3971746859133
    },
    "inputs": [
      {
        "key": "switch",
        "type": "triggerAndFinish",
        "label": "",
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "model",
        "type": "settingLLMModel",
        "label": "core.module.input.label.aiModel",
        "required": true,
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "llmModelType": "all",
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
        "key": "systemPrompt",
        "type": "textarea",
        "max": 3000,
        "valueType": "string",
        "label": "core.ai.Prompt",
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
      }
    ],
    "outputs": [
      {
        "key": "userChatInput",
        "label": "core.module.input.label.user question",
        "type": "hidden",
        "valueType": "string",
        "targets": []
      },
      {
        "key": "selectedTools",
        "valueType": "tools",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "3mbu91",
            "key": "selectedTools"
          }
        ]
      },
      {
        "key": "finish",
        "label": "",
        "description": "",
        "valueType": "boolean",
        "type": "hidden",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "3mbu91",
    "name": "HTTP 请求",
    "intro": "调用飞书webhook，发送一个通知",
    "avatar": "/imgs/module/http.png",
    "flowType": "httpRequest468",
    "showStatus": true,
    "position": {
      "x": 1483.6437630977423,
      "y": 798.9716928475544
    },
    "inputs": [
      {
        "key": "switch",
        "type": "triggerAndFinish",
        "label": "",
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
        "value": "这里填写你的飞书机器人地址",
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
        "value": "{\r\n    \"msg_type\": \"text\",\r\n    \"content\": {\r\n        \"text\": \"{{text}}\"\r\n    }\r\n}",
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
        "key": "system_addInputParam",
        "type": "addInputParam",
        "valueType": "any",
        "label": "",
        "required": false,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "editField": {
          "key": true,
          "description": true,
          "dataType": true
        },
        "defaultEditField": {
          "label": "",
          "key": "",
          "description": "",
          "inputType": "target",
          "valueType": "string"
        },
        "connected": false
      },
      {
        "valueType": "string",
        "type": "hidden",
        "key": "text",
        "label": "text",
        "toolDescription": "需要发送的通知内容",
        "required": true,
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "httpRawResponse",
        "label": "原始响应",
        "description": "HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。",
        "valueType": "any",
        "type": "source",
        "targets": [
          {
            "moduleId": "rzx4mj",
            "key": "switch"
          },
          {
            "moduleId": "psdhs1",
            "key": "switch"
          }
        ]
      },
      {
        "key": "system_addOutputParam",
        "type": "addOutputParam",
        "valueType": "any",
        "label": "",
        "targets": [],
        "editField": {
          "key": true,
          "description": true,
          "dataType": true,
          "defaultValue": true
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
        "required": false,
        "edit": true,
        "editField": {
          "key": true,
          "description": true,
          "dataType": true,
          "defaultValue": true
        },
        "targets": []
      }
    ]
  },
  {
    "moduleId": "rzx4mj",
    "name": "工具调用终止",
    "intro": "该模块需配置工具调用使用。当该模块被执行时，本次工具调用将会强制结束，并且不再调用AI针对工具调用结果回答问题。",
    "avatar": "/imgs/module/toolStop.svg",
    "flowType": "stopTool",
    "position": {
      "x": 2145.5070710160267,
      "y": 1306.3581817783079
    },
    "inputs": [
      {
        "key": "switch",
        "type": "triggerAndFinish",
        "label": "",
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
      }
    ],
    "outputs": []
  },
  {
    "moduleId": "psdhs1",
    "name": "指定回复",
    "intro": "该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。",
    "avatar": "/imgs/module/reply.png",
    "flowType": "answerNode",
    "position": {
      "x": 2117.0429459850598,
      "y": 1658.4125434513746
    },
    "inputs": [
      {
        "key": "switch",
        "type": "triggerAndFinish",
        "label": "",
        "description": "core.module.input.description.Trigger",
        "valueType": "any",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "connected": true
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
        "value": "笑死发送成功啦",
        "connected": false
      }
    ],
    "outputs": [
      {
        "key": "finish",
        "label": "",
        "description": "",
        "valueType": "boolean",
        "type": "hidden",
        "targets": []
      }
    ]
  }
]
```

## 3. 流程说明

1. 为工具调用挂载一个HTTP模块，功能描述写上：调用飞书webhook，发送一个通知。
2. HTTP模块的输入参数中，填写飞书机器人的地址，填写发送的通知内容。
3. HTTP模块输出连接上一个工具终止模块，用于强制结束工具调用。不终止的话，会把调用结果返回给模型，模型会继续回答一次问题，浪费 Tokens
4. HTTP模块输出再连上一个指定回复，直接回复一个发送成功，用于替代AI的回答。