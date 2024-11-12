---
title: '固定开头和结尾内容'
description: '利用指定回复，创建固定的开头和结尾'
icon: 'healing'
draft: false
toc: true
weight: 610
---

![](/imgs/demo-fix-evidence1.jpg)

![](/imgs/demo-fix-evidence2.jpg)


如上图，可以通过指定回复编排一个固定的开头和结尾内容。

## 模块编排

复制下面配置，点击「高级编排」右上角的导入按键，导入该配置。

{{% details title="编排配置" closed="true" %}}

```json
{
  "nodes": [
    {
      "nodeId": "7z5g5h",
      "name": "流程开始",
      "intro": "",
      "avatar": "/imgs/workflow/userChatInput.svg",
      "flowNodeType": "workflowStart",
      "position": {
        "x": -269.50851681351924,
        "y": 1657.6123698022448
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
            "7z5g5h",
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
      "nodeId": "nlfwkc",
      "name": "AI 对话",
      "intro": "AI 大模型对话",
      "avatar": "/imgs/workflow/AI.png",
      "flowNodeType": "chatNode",
      "showStatus": true,
      "position": {
        "x": 907.2058332478431,
        "y": 1348.9992737142143
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
          "type": "selectLLMModel",
          "required": true,
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "value": "gpt-3.5-turbo",
          "connected": false,
          "selectedTypeIndex": 0
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
          "step": 1,
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
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
          "step": 50,
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "isResponseAnswerText",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "value": true,
          "valueType": "boolean",
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "quoteTemplate",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string",
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "quotePrompt",
          "renderTypeList": [
            "hidden"
          ],
          "label": "",
          "valueType": "string",
          "type": "hidden",
          "showTargetInApp": false,
          "showTargetInPlugin": false,
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "systemPrompt",
          "renderTypeList": [
            "textarea",
            "reference"
          ],
          "max": 300,
          "valueType": "string",
          "label": "core.ai.Prompt",
          "description": "core.app.tip.chatNodeSystemPromptTip",
          "placeholder": "core.app.tip.chatNodeSystemPromptTip",
          "type": "textarea",
          "showTargetInApp": true,
          "showTargetInPlugin": true,
          "value": "",
          "connected": false,
          "selectedTypeIndex": 0
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
          "value": 6,
          "type": "numberInput",
          "showTargetInApp": true,
          "showTargetInPlugin": true,
          "connected": false,
          "selectedTypeIndex": 0
        },
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
          "type": "custom",
          "showTargetInApp": true,
          "showTargetInPlugin": true,
          "connected": true,
          "selectedTypeIndex": 0,
          "value": [
            "7z5g5h",
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
          "description": "core.module.Dataset quote.Input description",
          "valueType": "datasetQuote",
          "type": "target",
          "showTargetInApp": true,
          "showTargetInPlugin": true,
          "connected": true,
          "selectedTypeIndex": 0,
          "value": [
            "fljhzy",
            "quoteQA"
          ]
        }
      ],
      "outputs": [
        {
          "id": "answerText",
          "type": "static",
          "key": "answerText",
          "valueType": "string",
          "label": "core.module.output.label.Ai response content",
          "description": "core.module.output.description.Ai response content"
        },
        {
          "id": "history",
          "type": "static",
          "key": "history",
          "valueType": "chatHistory",
          "label": "core.module.output.label.New context",
          "description": "core.module.output.description.New context"
        }
      ]
    },
    {
      "nodeId": "q9equb",
      "name": "core.module.template.App system setting",
      "intro": "可以配置应用的系统参数。",
      "avatar": "/imgs/workflow/userGuide.png",
      "flowNodeType": "userGuide",
      "position": {
        "x": -275.92529567956024,
        "y": 1094.1001488133452
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
          "value": "你好，我是电影《星际穿越》 AI 助手，有什么可以帮助你的？\n[导演是谁]\n[剧情介绍]\n[票房分析]",
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
          "value": [],
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
          "connected": false,
          "selectedTypeIndex": 0
        },
        {
          "key": "whisper",
          "renderTypeList": [
            "hidden"
          ],
          "valueType": "any",
          "label": ""
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
      "nodeId": "tc90wz",
      "name": "指定回复",
      "intro": "该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。",
      "avatar": "/imgs/workflow/reply.png",
      "flowNodeType": "answerNode",
      "position": {
        "x": 159.49274056478237,
        "y": 1621.4635230667668
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
          "value": "这是开头\\n",
          "connected": false,
          "selectedTypeIndex": 0
        }
      ],
      "outputs": []
    },
    {
      "nodeId": "U5T3dMVY4wj7",
      "name": "指定回复",
      "intro": "该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。",
      "avatar": "/imgs/workflow/reply.png",
      "flowNodeType": "answerNode",
      "position": {
        "x": 1467.0625486167608,
        "y": 1597.346243737531
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
          "value": "这是结尾"
        }
      ],
      "outputs": []
    }
  ],
  "edges": [
    {
      "source": "7z5g5h",
      "target": "tc90wz",
      "sourceHandle": "7z5g5h-source-right",
      "targetHandle": "tc90wz-target-left"
    },
    {
      "source": "tc90wz",
      "target": "nlfwkc",
      "sourceHandle": "tc90wz-source-right",
      "targetHandle": "nlfwkc-target-left"
    },
    {
      "source": "nlfwkc",
      "target": "U5T3dMVY4wj7",
      "sourceHandle": "nlfwkc-source-right",
      "targetHandle": "U5T3dMVY4wj7-target-left"
    }
  ]
}
```

{{% /details %}}

