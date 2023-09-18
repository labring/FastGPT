---
title: '实验室预约'
description: '展示高级编排操作数据库的能力'
icon: 'database'
draft: false
toc: true
weight: 141
---

![](/imgs/demo-appointment1.png)

![](/imgs/demo-appointment2.png)

![](/imgs/demo-appointment3.png)

本示例演示了利用问题分类、内容提取和 HTTP 模块实现数据库的 CRUD 操作。以一个实验室预约为例，用户可以通过对话系统预约、取消、修改预约和查询预约记录。

# 编排流程解析

编排 Tips：**从左往右编辑流程；尽量不要使线交叉**。

## 1. 问题分类

![](/imgs/demo-appointment4.png)

如上图，用户问题作为对话的起点，流入【问题分类模块】，根据用户问题的内容，判断用户是询问实验室相关问题、预约实验室或其他问题。如果用户询问的是非实验问题，会直接拒绝回复内容。再根据问题是属于询问实验室相关/预约类问题，执行不同的流程。

{{% alert icon="🤗" context="warning" %}}
**Tips:** 这里需要增加适当的上下文，方便模型更好的判断属于哪个类别。 不过由于是使用了 GPT-3.5 模型进行判断，有时候会抽风~
{{% /alert %}}

## 2. 知识库搜索

![](/imgs/demo-appointment5.png)

这里不多介绍，标准的走了一套实验室介绍的知识库搜索。

## 3. 内容提取

![](/imgs/demo-appointment6.png)

内容提取是 AI 带来革命性的能力，可以从自然语言中提取出结构化的数据，从而方便进行逻辑处理。这里用了 2 个提取模块，一个用于提取姓名、时间和实验室名称；一个用于提取预约行为。

提取姓名、时间和实验室名称时候，需要注意把必填关掉，否则模型可能会伪造一些内容，同时再对数据处理时候，需要进行判空处理。

最后将两个提取的结果，通过 HTTP 模块发送到后端进行数据库的操作。

## 4. HTTP

HTTP 模块允许你调用任意 POST 类型的 HTTP 接口，从而实验一些复杂的业务逻辑。这里我们调用了一个预约实验室的接口，传入的是内容提取模块输出的 2 个提取结果。

![](/imgs/demo-appointment7.png)

从日志可以看出，提取的内容中包含了 2 个**字符串数组**，注意是字符串，所以需要进行一次额外的 parse 操作才能拿到里面的对象。具体逻辑可以参考[附件里的 Laf 代码](/docs/workflow/examples/lab_appointment/#laf-云函数代码)。

响应值也很简单，只需要返回一个 **JSON 对象**即可，注意，是对象，不是字符串。

# 总结

1. 问题分类可以在简单的场景下使用，判断用户的问题类型，从而实现不同的路线。
2. 可以通过内容提取模块，实现自然语言转结构化数据，从而实现复杂的逻辑操作。
3. 内容提取 + HTTP 模块允许你无限扩展。

# 附件

## 编排配置

可直接复制，导入到 FastGPT 中。

{{% details title="编排配置" closed="true" %}}

```json
[
  {
    "moduleId": "userChatInput",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 309.7143912167367,
      "y": 1501.2761754220846
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
            "moduleId": "hlw67t",
            "key": "userChatInput"
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
      "x": 266.7681439415004,
      "y": 1152.956322172662
    },
    "inputs": [
      {
        "key": "maxContext",
        "type": "numberInput",
        "label": "最长记录数",
        "value": 16,
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
        "valueType": "chat_history",
        "type": "source",
        "targets": [
          {
            "moduleId": "hlw67t",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "98xq69",
    "name": "文本内容提取",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 1990.50096174463,
      "y": 1162.2928248187695
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
        "key": "description",
        "type": "textarea",
        "valueType": "string",
        "value": "你是实验室预约助手，从文本中提取出: 用户的姓名、预约时间和实验室名称。当前时间 {{cTime}}",
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
        "valueType": "chat_history",
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
            "desc": "姓名",
            "key": "name",
            "required": false
          },
          {
            "desc": "时间(YYYY/MM/DD HH:mm格式)",
            "key": "time",
            "required": false
          },
          {
            "desc": "实验室名",
            "key": "labname",
            "required": false
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
        "targets": [
          {
            "moduleId": "ux0wk1",
            "key": "appointment"
          }
        ]
      },
      {
        "key": "name",
        "label": "提取结果-姓名",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "time",
        "label": "提取结果-时间(YYYY/MM/DD HH:mm格式)",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "labname",
        "label": "提取结果-实验室名",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "ux0wk1",
    "name": "HTTP模块",
    "flowType": "httpRequest",
    "showStatus": true,
    "position": {
      "x": 2708.3795785896,
      "y": 1751.695782003616
    },
    "inputs": [
      {
        "key": "url",
        "value": "",
        "type": "input",
        "label": "请求地址",
        "description": "请求目标地址",
        "placeholder": "https://api.fastgpt.run/getInventory",
        "required": true,
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
        "valueType": "string",
        "type": "target",
        "label": "提取的字段",
        "edit": true,
        "key": "appointment",
        "required": true,
        "connected": true
      },
      {
        "valueType": "string",
        "type": "target",
        "label": "预约行为",
        "edit": true,
        "key": "action",
        "required": true,
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "finish",
        "label": "请求结束",
        "valueType": "boolean",
        "type": "source",
        "targets": []
      },
      {
        "label": "提取结果",
        "valueType": "string",
        "type": "source",
        "edit": true,
        "targets": [
          {
            "moduleId": "eg5upi",
            "key": "text"
          }
        ],
        "key": "response"
      }
    ]
  },
  {
    "moduleId": "eg5upi",
    "name": "指定回复",
    "flowType": "answerNode",
    "position": {
      "x": 3437.5642119438417,
      "y": 1941.2730515095657
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
        "key": "text",
        "type": "textarea",
        "valueType": "string",
        "value": "",
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
  },
  {
    "moduleId": "kge59i",
    "name": "用户引导",
    "flowType": "userGuide",
    "position": {
      "x": 278.3025954454602,
      "y": 879.3568006623397
    },
    "inputs": [
      {
        "key": "welcomeText",
        "type": "input",
        "label": "开场白",
        "value": "你好，我是实验室助手，请问有什么可以帮助你的么？如需预约或修改预约实验室，请提供姓名、时间和实验室名称。\n[实验室介绍]\n[开放时间]\n[预约]",
        "connected": true
      }
    ],
    "outputs": []
  },
  {
    "moduleId": "hlw67t",
    "name": "问题分类",
    "flowType": "classifyQuestion",
    "showStatus": true,
    "position": {
      "x": 763.6974006305715,
      "y": 1164.1601096928105
    },
    "inputs": [
      {
        "key": "systemPrompt",
        "type": "textarea",
        "valueType": "string",
        "value": "你是实验室助手，判断用户是询问实验室相关问题、预约实验室或其他问题",
        "label": "系统提示词",
        "description": "你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。",
        "placeholder": "例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统",
        "connected": true
      },
      {
        "key": "history",
        "type": "target",
        "label": "聊天记录",
        "valueType": "chat_history",
        "connected": true
      },
      {
        "key": "userChatInput",
        "type": "target",
        "label": "用户问题",
        "required": true,
        "valueType": "string",
        "connected": true
      },
      {
        "key": "agents",
        "type": "custom",
        "label": "",
        "value": [
          {
            "value": "实验室问题",
            "key": "fasw"
          },
          {
            "value": "新增、取消、查询、修改预约实验室",
            "key": "fqsw"
          },
          {
            "value": "其他问题",
            "key": "sq32"
          }
        ],
        "connected": true
      }
    ],
    "outputs": [
      {
        "key": "fasw",
        "label": "",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "zltb5l",
            "key": "switch"
          }
        ]
      },
      {
        "key": "fqsw",
        "label": "",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "98xq69",
            "key": "switch"
          }
        ]
      },
      {
        "key": "sq32",
        "label": "",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "l5xe4u",
            "key": "switch"
          }
        ]
      },
      {
        "key": "fesw",
        "label": "",
        "type": "hidden",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "l5xe4u",
    "name": "指定回复",
    "flowType": "answerNode",
    "position": {
      "x": 777.8362177291783,
      "y": 1954.8053341919722
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
        "value": "对不起，我不太理解你的问题，请更详细描述关于实验室问题。",
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
  },
  {
    "moduleId": "zltb5l",
    "name": "知识库搜索",
    "flowType": "kbSearchNode",
    "showStatus": true,
    "position": {
      "x": 1634.995464753433,
      "y": 108.17018849334033
    },
    "inputs": [
      {
        "key": "kbList",
        "type": "custom",
        "label": "关联的知识库",
        "value": [
          {
            "kbId": "64f585865ae84cf2f223e8bd",
            "vectorModel": {
              "model": "text-embedding-ada-002",
              "name": "Embedding-2",
              "price": 0.2,
              "defaultToken": 500,
              "maxToken": 3000
            }
          }
        ],
        "list": [],
        "connected": true
      },
      {
        "key": "similarity",
        "type": "slider",
        "label": "相似度",
        "value": 0.69,
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
        "value": 2,
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
        "valueType": "kb_quote",
        "targets": [
          {
            "moduleId": "bjfklc",
            "key": "quoteQA"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "bjfklc",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2365.8777933722004,
      "y": -8.20949749350251
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
        "value": 550,
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
        "description": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "placeholder": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
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
        "valueType": "kb_quote",
        "connected": true
      },
      {
        "key": "history",
        "type": "target",
        "label": "聊天记录",
        "valueType": "chat_history",
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
        "label": "模型回复",
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
    "moduleId": "ee1fo3",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 1133.7087158919899,
      "y": 638.1461154935015
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
            "moduleId": "zltb5l",
            "key": "userChatInput"
          },
          {
            "moduleId": "bjfklc",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "14dsss",
    "name": "聊天记录",
    "flowType": "historyNode",
    "position": {
      "x": 1670.1688237345365,
      "y": 785.0835604459131
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
        "valueType": "chat_history",
        "type": "source",
        "targets": [
          {
            "moduleId": "bjfklc",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "mhw4md",
    "name": "文本内容提取",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 1955.3493020276055,
      "y": 2135.4407620304137
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
        "value": "请根据我们的对话，判断我是需要预约、取消预约还是修改预约实验室。",
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
        "valueType": "chat_history",
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
            "desc": "预约实验室",
            "key": "post",
            "required": false
          },
          {
            "desc": "取消预约",
            "key": "remove",
            "required": false
          },
          {
            "desc": "修改预约",
            "key": "put",
            "required": false
          },
          {
            "desc": "查询预约记录",
            "key": "get",
            "required": false
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
        "targets": [
          {
            "moduleId": "ux0wk1",
            "key": "action"
          }
        ]
      },
      {
        "key": "post",
        "label": "提取结果-预约实验室",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "put",
        "label": "提取结果-修改预约",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "remove",
        "label": "提取结果-取消预约",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      },
      {
        "key": "get",
        "label": "提取结果-查询预约记录",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "643ik3",
    "name": "聊天记录",
    "flowType": "historyNode",
    "position": {
      "x": 1402.5447731090367,
      "y": 1933.5935888119106
    },
    "inputs": [
      {
        "key": "maxContext",
        "type": "numberInput",
        "label": "最长记录数",
        "value": 16,
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
        "valueType": "chat_history",
        "type": "source",
        "targets": [
          {
            "moduleId": "98xq69",
            "key": "history"
          },
          {
            "moduleId": "mhw4md",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "x3ymlc",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 1457.4894986450388,
      "y": 1763.0754750794902
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
            "moduleId": "98xq69",
            "key": "content"
          },
          {
            "moduleId": "mhw4md",
            "key": "content"
          }
        ]
      }
    ]
  }
]
```

{{% /details %}}

## Laf 云函数代码

可以在 [Laf](https://laf.dev/) 中快速构建 HTTP 接口。

{{% details title="函数代码" closed="true" %}}

```typescript
import cloud from '@lafjs/cloud';
const db = cloud.database();

export default async function (ctx: FunctionContext) {
  try {
    const { appointment, action } = ctx.body;
    console.log(appointment, action);
    const parseBody = JSON.parse(appointment);
    const { get, post, put, remove } = JSON.parse(action);

    if (!!get) {
      return await getRecord(parseBody);
    }
    if (!!post) {
      return await createRecord(parseBody);
    }
    if (!!put) {
      return await putRecord(parseBody);
    }
    if (!!remove) {
      return await removeRecord(parseBody);
    }

    return {
      response: '异常'
    };
  } catch (err) {
    return {
      response: '异常'
    };
  }
}

async function putRecord({ name, time, labname }) {
  const missData = [];
  if (!name) missData.push('你的姓名');

  if (missData.length > 0) {
    return {
      response: `请提供: ${missData.join('、')}`
    };
  }

  const { data: record } = await db
    .collection('LabAppointment')
    .where({
      name,
      status: 'unStart'
    })
    .getOne();

  if (!record) {
    return {
      response: `${name} 还没有预约记录`
    };
  }

  const updateWhere = {
    name,
    time: time || record.time,
    labname: labname || record.labname
  };

  await db
    .collection('LabAppointment')
    .where({
      name,
      status: 'unStart'
    })
    .update(updateWhere);

  return {
    response: `修改预约成功。
  姓名：${name}
  时间: ${updateWhere.time}
  实验室: ${updateWhere.labname}
  `
  };
}

async function getRecord({ name }) {
  if (!name) {
    return {
      response: '请提供你的姓名'
    };
  }
  const { data } = await db
    .collection('LabAppointment')
    .where({ name, status: 'unStart' })
    .getOne();

  if (!data) {
    return {
      response: `${name} 没有预约中的记录`
    };
  }
  return {
    response: `${name} 有一条预约记录：
姓名：${data.name}
时间: ${data.time}
实验室: ${data.labname}
    `
  };
}

async function removeRecord({ name }) {
  if (!name) {
    return {
      response: '请提供你的姓名'
    };
  }
  const { deleted } = await db
    .collection('LabAppointment')
    .where({ name, status: 'unStart' })
    .remove();

  if (deleted > 0) {
    return {
      response: `取消预约记录成功: ${name}`
    };
  }
  return {
    response: ` ${name} 没有预约中的记录`
  };
}

async function createRecord({ name, time, labname }) {
  const missData = [];
  if (!name) missData.push('你的姓名');
  if (!time) missData.push('需要预约的时间');
  if (!labname) missData.push('实验室名称');

  if (missData.length > 0) {
    return {
      response: `请提供: ${missData.join('、')}`
    };
  }

  const { data: record } = await db
    .collection('LabAppointment')
    .where({
      name,
      status: 'unStart'
    })
    .getOne();

  if (record) {
    return {
      response: `您已经有一个预约记录了:
姓名：${record.name}
时间: ${record.time}
实验室: ${record.labname}

每人仅能同时预约一个实验室。
      `
    };
  }

  await db.collection('LabAppointment').add({
    name,
    time,
    labname,
    status: 'unStart'
  });

  return {
    response: `预约成功。
姓名：${name}
时间: ${time}
实验室: ${labname}
  `
  };
}
```

{{% /details %}}
