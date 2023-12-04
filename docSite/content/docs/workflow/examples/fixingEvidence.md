---
title: '固定开头和结尾内容'
description: '利用指定回复，创建固定的开头和结尾'
icon: 'healing'
draft: false
toc: true
weight: 401
---

![](/imgs/demo-fix-evidence1.png)

![](/imgs/demo-fix-evidence2.png)


如上图，可以通过指定回复编排一个固定的开头和结尾内容。

## 模块编排

复制下面配置，点击「高级编排」右上角的导入按键，导入该配置。

{{% details title="编排配置" closed="true" %}}

```json
[
  {
    "moduleId": "userChatInput",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 59.03170043915989,
      "y": 1604.8595605938747
    },
    "inputs": [
      {
        "key": "userChatInput",
        "type": "systemInput",
        "label": "用户问题",
        "connected": true
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
            "moduleId": "chatModule",
            "key": "userChatInput"
          },
          {
            "moduleId": "ymqh0t",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "history",
    "name": "聊天记录",
    "flowType": "historyNode",
    "position": {
      "x": 38.19233923987295,
      "y": 1184.4581738905642
    },
    "inputs": [
      {
        "key": "maxContext",
        "type": "numberInput",
        "label": "最长记录数",
        "value": 6,
        "min": 0,
        "max": 50,
        "connected": true
      },
      {
        "key": "history",
        "type": "hidden",
        "label": "聊天记录",
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "history",
        "label": "聊天记录",
        "valueType": "chatHistory",
        "type": "source",
        "targets": [
          {
            "moduleId": "chatModule",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "chatModule",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 943.1225685246793,
      "y": 891.3094521573212
    },
    "inputs": [
      {
        "key": "model",
        "type": "custom",
        "label": "对话模型",
        "value": "gpt-3.5-turbo",
        "list": [
          {
            "label": "FastGPT-4k",
            "value": "gpt-3.5-turbo"
          },
          {
            "label": "FastGPT-16k",
            "value": "gpt-3.5-turbo-16k"
          },
          {
            "label": "文心一言",
            "value": "ERNIE-Bot"
          },
          {
            "label": "FastGPT-Plus",
            "value": "gpt-4"
          },
          {
            "label": "glm2(演示娱乐)",
            "value": "glm2-6b"
          }
        ],
        "connected": true
      },
      {
        "key": "temperature",
        "type": "slider",
        "label": "温度",
        "value": 0,
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
        "connected": true
      },
      {
        "key": "maxToken",
        "type": "custom",
        "label": "回复上限",
        "value": 2000,
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
        "connected": true
      },
      {
        "key": "systemPrompt",
        "type": "textarea",
        "label": "系统提示词",
        "max": 300,
        "valueType": "string",
        "description": "模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}",
        "placeholder": "模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}",
        "value": "",
        "connected": true
      },
      {
        "key": "limitPrompt",
        "type": "textarea",
        "valueType": "string",
        "label": "限定词",
        "max": 500,
        "description": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。不建议内容太长，会影响上下文，可使用变量，例如 {{language}}。可在文档中找到对应的限定例子",
        "placeholder": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。不建议内容太长，会影响上下文，可使用变量，例如 {{language}}。可在文档中找到对应的限定例子",
        "value": "",
        "connected": true
      },
      {
        "key": "switch",
        "type": "target",
        "label": "触发器",
        "valueType": "any",
        "connected": true
      },
      {
        "key": "quoteQA",
        "type": "target",
        "label": "引用内容",
        "description": "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
        "valueType": "datasetQuote",
        "connected": false
      },
      {
        "key": "history",
        "type": "target",
        "label": "聊天记录",
        "valueType": "chatHistory",
        "connected": true
      },
      {
        "key": "userChatInput",
        "type": "target",
        "label": "用户问题",
        "required": true,
        "valueType": "string",
        "connected": true
      }
    ],
    "outputs": [
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
        "label": "回复结束",
        "description": "AI 回复完成后触发",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "ojeopv",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "ymqh0t",
    "name": "指定回复",
    "flowType": "answerNode",
    "position": {
      "x": 435.27459673941917,
      "y": 1081.9477378716076
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "触发器",
        "valueType": "any",
        "connected": true
      },
      {
        "key": "text",
        "type": "textarea",
        "valueType": "string",
        "value": "这是AI作答：\n\n---\n\n",
        "label": "回复的内容",
        "description": "可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容",
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "finish",
        "label": "回复结束",
        "description": "回复完成后触发",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "chatModule",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "ojeopv",
    "name": "指定回复",
    "flowType": "answerNode",
    "position": {
      "x": 1573.4540253108476,
      "y": 1551.9808807287498
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "触发器",
        "valueType": "any",
        "connected": true
      },
      {
        "key": "text",
        "type": "textarea",
        "valueType": "string",
        "value": "\\n\n---\n\n这是固定的结尾",
        "label": "回复的内容",
        "description": "可以使用 \\n 来实现换行。也可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容",
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "finish",
        "label": "回复结束",
        "description": "回复完成后触发",
        "valueType": "boolean",
        "type": "source",
        "targets": []
      }
    ]
  }
]
```

{{% /details %}}

