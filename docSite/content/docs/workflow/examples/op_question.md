---
title: '优化知识库搜索词'
description: '利用 GPT 优化和完善知识库搜索词，实现上下文关联搜索'
icon: 'search'
draft: false
toc: true
weight: 144
---

![](/imgs/demo_op_question1.png)

|          优化前             |          优化后             |
| --------------------- | --------------------- |
| ![](/imgs/demo_op_question3.png) | ![](/imgs/demo_op_question2.png) |

如上图，优化后的搜索可以针对【自动数据预处理】进行搜索，从而找到其相关的内容，一定程度上弥补了向量搜索的上下文缺失问题。

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
      "x": 585.750318069507,
      "y": 1597.4127130315183
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
            "moduleId": "ssdd86",
            "key": "content"
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
      "x": 567.49877916803,
      "y": 1289.3453864378014
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
            "moduleId": "ssdd86",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "nkxlso",
    "name": "知识库搜索",
    "flowType": "datasetSearchNode",
    "showStatus": true,
    "position": {
      "x": 1542.6434554710224,
      "y": 1153.7853815737192
    },
    "inputs": [
      {
        "key": "kbList",
        "type": "custom",
        "label": "关联的知识库",
        "value": [],
        "list": [],
        "connected": true
      },
      {
        "key": "similarity",
        "type": "slider",
        "label": "相似度",
        "value": 0.8,
        "min": 0,
        "max": 1,
        "step": 0.01,
        "markList": [
          {
            "label": "100",
            "value": 100
          },
          {
            "label": "1",
            "value": 1
          }
        ],
        "connected": true
      },
      {
        "key": "limit",
        "type": "slider",
        "label": "单次搜索上限",
        "description": "最多取 n 条记录作为本次问题引用",
        "value": 7,
        "min": 1,
        "max": 20,
        "step": 1,
        "markList": [
          {
            "label": "1",
            "value": 1
          },
          {
            "label": "20",
            "value": 20
          }
        ],
        "connected": true
      },
      {
        "key": "switch",
        "type": "target",
        "label": "触发器",
        "valueType": "any",
        "connected": false
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
        "key": "isEmpty",
        "label": "搜索结果为空",
        "type": "source",
        "valueType": "boolean",
        "targets": []
      },
      {
        "key": "unEmpty",
        "label": "搜索结果不为空",
        "type": "source",
        "valueType": "boolean",
        "targets": []
      },
      {
        "key": "quoteQA",
        "label": "引用内容",
        "description": "始终返回数组，如果希望搜索结果为空时执行额外操作，需要用到上面的两个输入以及目标模块的触发器",
        "type": "source",
        "valueType": "datasetQuote",
        "targets": [
          {
            "moduleId": "ol82hp",
            "key": "quoteQA"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "ol82hp",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2207.4577044902126,
      "y": 1079.6308003796544
    },
    "inputs": [
      {
        "key": "model",
        "type": "custom",
        "label": "对话模型",
        "value": "gpt-3.5-turbo",
        "list": [],
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
        "value": "我会向你询问三引号引用中提及的内容，你仅使用提供的引用内容来回答我的问题，不要做额外的扩展补充。",
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
        "connected": false
      },
      {
        "key": "quoteQA",
        "type": "target",
        "label": "引用内容",
        "description": "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
        "valueType": "datasetQuote",
        "connected": true
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
        "targets": []
      }
    ]
  },
  {
    "moduleId": "o62kns",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 1696.5940057372968,
      "y": 2270.5070479742435
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
            "moduleId": "ol82hp",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "he7013",
    "name": "聊天记录",
    "flowType": "historyNode",
    "position": {
      "x": 1636.793907221069,
      "y": 1952.7122387165764
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
            "moduleId": "ol82hp",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "ssdd86",
    "name": "文本内容提取",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 1031.822028231947,
      "y": 1231.9793566344022
    },
    "inputs": [
      {
        "key": "switch",
        "type": "target",
        "label": "触发器",
        "valueType": "any",
        "connected": false
      },
      {
        "key": "description",
        "type": "textarea",
        "valueType": "string",
        "value": "结合上下文，优化用户的问题，要求不能包含\"它\"、\"第几个\"等代名词，需将他们替换成具体的名词。",
        "label": "提取要求描述",
        "description": "写一段提取要求，告诉 AI 需要提取哪些内容",
        "required": true,
        "placeholder": "例如: \n1. 你是一个实验室预约助手。根据用户问题，提取出姓名、实验室号和预约时间",
        "connected": true
      },
      {
        "key": "history",
        "type": "target",
        "label": "聊天记录",
        "valueType": "chatHistory",
        "connected": true
      },
      {
        "key": "content",
        "type": "target",
        "label": "需要提取的文本",
        "required": true,
        "valueType": "string",
        "connected": true
      },
      {
        "key": "extractKeys",
        "type": "custom",
        "label": "目标字段",
        "description": "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
        "value": [
          {
            "desc": "优化后的问题",
            "key": "q",
            "required": true
          }
        ],
        "connected": true
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
        "targets": []
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
        "key": "q",
        "label": "提取结果-优化后的问题",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": [
          {
            "moduleId": "nkxlso",
            "key": "userChatInput"
          }
        ]
      }
    ]
  }
]
```

{{% /details %}}

## 流程说明

1. 利用内容提取模块，将用户的问题进行优化。
2. 将优化后的问题传递到知识库搜索模块进行搜索。
3. 搜索内容传递到 AI 对话模块，进行回答。

## Tips

内容提取模块可以将自然语言提取成结构化数据，可以使用其进行一些神奇的操作。