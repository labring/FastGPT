---
title: '实验室预约'
description: '展示高级编排操作数据库的能力'
icon: 'database'
draft: false
toc: true
weight: 403
---

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/demo-appointment1.jpg) | ![](/imgs/demo-appointment2.jpg) |
| ![](/imgs/demo-appointment3.jpg) | ![](/imgs/demo-appointment4.jpg) |



本示例演示了利用问题分类、内容提取和 HTTP 模块实现数据库的 CRUD 操作。以一个实验室预约为例，用户可以通过对话系统预约、取消、修改预约和查询预约记录。

# 编排流程解析

编排 Tips：**从左往右编辑流程；尽量不要使线交叉**。

## 1. 全局变量使用

通过设计一个全局变量，让用户输入姓名，模拟用户身份信息。实际使用过程中，通常是直接通过嵌入 Token 来标记用户身份。

## 2. 问题分类

![](/imgs/demo-appointment5.jpg)

如上图，用户问题作为对话的起点，流入【问题分类模块】，根据用户问题的内容，判断用户是询问实验室相关问题、预约实验室或其他问题。如果用户询问的是非实验问题，会直接拒绝回复内容。再根据问题是属于询问实验室相关/预约类问题，执行不同的流程。

{{% alert icon="🤗" context="warning" %}}
**Tips:** 这里需要增加适当的上下文，方便模型更好的判断属于哪个类别~
{{% /alert %}}

## 3. 实验室介绍的知识库搜索


这里不多介绍，标准的走了一套知识库搜索流程。

## 4. 内容提取

|                       |                       | |
| --------------------- | --------------------- |--------------------- |
| ![](/imgs/demo-appointment6.jpg) | ![](/imgs/demo-appointment7.jpg) | ![](/imgs/demo-appointment8.jpg) |

内容提取是 LLM 带来的十分重要的能力，可以从自然语言中提取出结构化的数据，从而方便进行逻辑处理。

这里用了 2 个提取模块，一个用于提取预约时间和实验室名称；一个用于提取预约行为。

提取时间和实验室名称时候，需要注意把必填关掉，否则模型可能会伪造一些内容，同时再对数据处理时候，需要进行判空处理。

最后将两个提取的结果，通过 HTTP 模块发送到后端进行数据库的操作。

## 5. HTTP模块执行预约操作

HTTP 模块允许你调用任意 GET/POST 类型的 HTTP 接口，从而实现一些复杂的业务逻辑。这里我们调用了一个预约实验室的接口，传入的是信息提取模块的结果和预约行为。

![](/imgs/demo-appointment9.jpg)

具体的入参结构可以参考[HTTP模块](/docs/workflow/modules/http/)，实在不行在接口里多打印 Debug。

响应值也很简单，只需要返回一个 **JSON 对象** 即可。注意！是对象，不是字符串。

# 总结

1. 问题分类可以在简单的场景下使用，判断用户的问题类型，从而实现不同的路线。
2. 可以通过内容提取模块，实现自然语言转结构化数据，从而实现复杂的逻辑操作。
3. 内容提取 + HTTP 模块允许你无限扩展。

**困难点**

1. 模型对连续对话时，分类和提取能力不足


# 附件

## 编排配置

可直接复制，导入到 FastGPT 中。

{{% details title="编排配置" closed="true" %}}

```json
[
  {
    "moduleId": "userChatInput",
    "name": "用户问题(对话入口)",
    "avatar": "/imgs/module/userChatInput.png",
    "flowType": "questionInput",
    "position": {
      "x": 309.7143912167367,
      "y": 1501.2761754220846
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
            "moduleId": "hlw67t",
            "key": "userChatInput"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "98xq69",
    "name": "文本内容提取",
    "avatar": "/imgs/module/extract.png",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 2025.8337531196155,
      "y": 1104.8374776004466
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
        "value": "系统参数：\n- 当前时间：{{cTime}}\n\n你是实验室预约助手，请从对话中获取相关预约信息：\n\n1. 用户期望预约时间\n2. 实验室名称",
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
        "value": 8,
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
            "desc": "预约时间 (YYYY/MM/DD HH:mm 格式)",
            "key": "time",
            "required": false,
            "enum": ""
          },
          {
            "desc": "实验室名",
            "key": "labname",
            "required": false
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
            "moduleId": "xznuym",
            "key": "info"
          }
        ]
      },
      {
        "key": "time",
        "label": "提取结果-预约时间 (YYYY/MM/DD HH:mm 格式)",
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
    "moduleId": "eg5upi",
    "name": "指定回复",
    "avatar": "/imgs/module/reply.png",
    "flowType": "answerNode",
    "position": {
      "x": 3273.0448927780258,
      "y": 2339.4574906500184
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
        "key": "text",
        "type": "textarea",
        "valueType": "any",
        "label": "回复的内容",
        "description": "可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串",
        "placeholder": "可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "value": "",
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
    "moduleId": "kge59i",
    "name": "用户引导",
    "avatar": "/imgs/module/userGuide.png",
    "flowType": "userGuide",
    "position": {
      "x": 271.18826350548954,
      "y": 777.38470952276
    },
    "inputs": [
      {
        "key": "welcomeText",
        "type": "hidden",
        "valueType": "string",
        "label": "开场白",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "你好，我是实验室助手，请问有什么可以帮助你的么？如需预约或修改预约实验室，请提供姓名、时间和实验室名称。\n[实验室介绍]\n[开放时间]\n[预约]",
        "connected": false
      },
      {
        "key": "variables",
        "type": "hidden",
        "valueType": "any",
        "label": "对话框变量",
        "value": [
          {
            "id": "nzpco0",
            "key": "name",
            "label": "姓名",
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
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "questionGuide",
        "valueType": "boolean",
        "type": "switch",
        "label": "问题引导",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": false,
        "connected": false
      },
      {
        "key": "tts",
        "type": "hidden",
        "valueType": "any",
        "label": "语音播报",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      }
    ],
    "outputs": []
  },
  {
    "moduleId": "hlw67t",
    "name": "问题分类",
    "avatar": "/imgs/module/cq.png",
    "flowType": "classifyQuestion",
    "showStatus": true,
    "position": {
      "x": 763.6974006305715,
      "y": 1164.1601096928105
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
        "type": "selectCQModel",
        "valueType": "string",
        "label": "分类模型",
        "required": true,
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "gpt-4",
        "connected": false
      },
      {
        "key": "systemPrompt",
        "type": "textarea",
        "valueType": "string",
        "label": "背景知识",
        "description": "你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。",
        "placeholder": "例如: \n1. AIGC（人工智能生成内容）是指使用人工智能技术自动或半自动地生成数字内容，如文本、图像、音乐、视频等。\n2. AIGC技术包括但不限于自然语言处理、计算机视觉、机器学习和深度学习。这些技术可以创建新内容或修改现有内容，以满足特定的创意、教育、娱乐或信息需求。",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "value": "实验室是由浙江工业大学主导的人工智能实验室，请判断用户的问题是属于询问实验室介绍，或是预约实验室。",
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
        "value": 12,
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
      },
      {
        "key": "agents",
        "type": "custom",
        "valueType": "any",
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
            "value": "一般聊天",
            "key": "sq32"
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
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
          },
          {
            "moduleId": "mhw4md",
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
      },
      {
        "key": "wqre",
        "label": "",
        "type": "hidden",
        "targets": []
      },
      {
        "key": "sdfa",
        "label": "",
        "type": "hidden",
        "targets": []
      },
      {
        "key": "agex",
        "label": "",
        "type": "hidden",
        "targets": []
      }
    ]
  },
  {
    "moduleId": "l5xe4u",
    "name": "指定回复",
    "avatar": "/imgs/module/reply.png",
    "flowType": "answerNode",
    "position": {
      "x": 1094.059515373104,
      "y": 2184.2930987678496
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
        "key": "text",
        "type": "textarea",
        "valueType": "any",
        "label": "回复的内容",
        "description": "可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串",
        "placeholder": "可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串",
        "showTargetInApp": true,
        "showTargetInPlugin": true,
        "value": "对不起，我不太理解你的问题，请更详细描述关于实验室问题。",
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
      }
    ]
  },
  {
    "moduleId": "zltb5l",
    "name": "知识库搜索",
    "avatar": "/imgs/module/db.png",
    "flowType": "datasetSearchNode",
    "showStatus": true,
    "position": {
      "x": 1573.0026778213864,
      "y": 17.56534605419546
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
        "key": "datasets",
        "type": "selectDataset",
        "label": "关联的知识库",
        "value": [],
        "valueType": "selectDataset",
        "list": [],
        "required": true,
        "showTargetInApp": false,
        "showTargetInPlugin": true,
        "connected": false
      },
      {
        "key": "similarity",
        "type": "hidden",
        "label": "最低相关性",
        "value": 0.69,
        "valueType": "number",
        "min": 0,
        "max": 1,
        "step": 0.01,
        "markList": [
          {
            "label": "0",
            "value": 0
          },
          {
            "label": "1",
            "value": 1
          }
        ],
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "limit",
        "type": "hidden",
        "label": "引用上限",
        "description": "单次搜索最大的 Tokens 数量，中文约1字=1.7Tokens，英文约1字=1Tokens",
        "value": 2,
        "valueType": "number",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "connected": false
      },
      {
        "key": "searchMode",
        "type": "hidden",
        "label": "core.dataset.search.Mode",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "embedding",
        "connected": false
      },
      {
        "key": "datasetParamsModal",
        "type": "selectDatasetParamsModal",
        "label": "",
        "valueType": "any",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
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
            "moduleId": "bjfklc",
            "key": "quoteQA"
          }
        ]
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
    "moduleId": "bjfklc",
    "name": "AI 对话",
    "avatar": "/imgs/module/AI.png",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2365.8777933722004,
      "y": -8.20949749350251
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
        "value": 550,
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
        "value": "",
        "connected": false
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
        "showTargetInApp": false,
        "showTargetInPlugin": false,
        "value": "",
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
        "value": 4,
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
        "connected": true
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
      },
      {
        "key": "limitPrompt",
        "type": "textarea",
        "valueType": "string",
        "label": "限定词",
        "description": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "placeholder": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "value": "",
        "connected": false
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
        "key": "history",
        "label": "新的上下文",
        "description": "将本次回复内容拼接上历史记录，作为新的上下文返回",
        "valueType": "chatHistory",
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
    "moduleId": "ee1fo3",
    "name": "用户问题(对话入口)",
    "avatar": "/imgs/module/userChatInput.png",
    "flowType": "questionInput",
    "position": {
      "x": 1252.9256138382332,
      "y": 704.9075783433977
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
    "moduleId": "mhw4md",
    "name": "文本内容提取",
    "avatar": "/imgs/module/extract.png",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 2035.4759582500983,
      "y": 2140.0194281002705
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
        "value": "判断我的行为：查询预约，新增预约、取消预约或者修改预约实验室。",
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
        "value": 4,
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
            "desc": "行为",
            "key": "action",
            "required": true,
            "enum": "post\ndelete\nput\nget"
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
        "key": "action",
        "label": "提取结果-行为",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": [
          {
            "moduleId": "xznuym",
            "key": "action"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "x3ymlc",
    "name": "用户问题(对话入口)",
    "avatar": "/imgs/module/userChatInput.png",
    "flowType": "questionInput",
    "position": {
      "x": 1482.787362456553,
      "y": 1763.0754750794902
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
  },
  {
    "moduleId": "xznuym",
    "name": "HTTP模块",
    "avatar": "/imgs/module/http.png",
    "flowType": "httpRequest",
    "showStatus": true,
    "position": {
      "x": 2751.575624241899,
      "y": 1976.1556611102292
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
        "key": "info",
        "valueType": "string",
        "label": "资料提取结果",
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
        "key": "action",
        "valueType": "string",
        "label": "预约行为",
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
        "key": "result",
        "label": "结果",
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
            "moduleId": "eg5upi",
            "key": "text"
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

```ts
import cloud from '@lafjs/cloud'
const db = cloud.database()

type RequestType = {
  variables: {
    name: string;
  }
  data: {
    info: string;
    action: 'post' | 'delete' | 'put' | 'get'
  }
}
type recordType = {
  name?: string;
  time?: string;
  labname?: string;
}

export default async function (ctx: FunctionContext) {
  try {
    const { variables: { name }, data: { info, action } } = ctx.body as RequestType

    const parseBody = { name, ...JSON.parse(info) } as recordType

    if (action === 'get') {
      return await getRecord(parseBody)
    }
    if (action === 'post') {
      return await createRecord(parseBody)
    }
    if (action === 'put') {
      return await putRecord(parseBody)
    }
    if (action === 'delete') {
      return await removeRecord(parseBody)
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

async function putRecord({ name, time, labname }: recordType) {
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


async function getRecord({ name }: recordType) {
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

async function removeRecord({ name }: recordType) {
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

async function createRecord({ name, time, labname }: recordType) {
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
