---
title: '全能助手'
description: '赋予联网功能，将用户问题进行分类，细分后对接对应 API 获取信息，经 GPT 整理后返回'
icon: 'search'
draft: false
toc: true
weight: 406
---

**该教程由社区提供，部分模块已经过期，需调整后才能使用。**

![](/imgs/versatile_assistant_1.png)

众所周知 GPT 只是一个语言模型，功能上有很多局限，但只要综合利用高级编排各模块功能，就可以轻松突破原有 GPT 的局限，实现更多功能。

当然，所谓“全能助手”只是一个遥远的设想，高级编排的玩法有很大的可能性，本文只是扩展了诸如【天气查询】、【微博热搜查询】的功能，主要还是希望大家能通过案例来了解下高级编排的思路，然后可以分享更多有意思的玩法。

## 简要介绍一下“全能助手”的思路

思路说来也简单，以下分别用文字和图片两种方式介绍下

- **文字描述：**

1. 对于用户输入的问题，通过【问题分类】模块进行区分，分出【询问天气】、【微博热搜】、【其他问题】等
2. 对于【询问天气】的情况，调用第三方 API 查询天气（后文会介绍），将查询到的 json 结果丢给【AI 对话】模块，让它根据用户问题来给出回答
3. 对于【微博热搜】的情况，同理，也是调的第三方 API
4. 对于【其他问题】的情况，直接走【AI 对话】模块就好了，跟普通的 GPT 聊天一样

- **流程图（方便理解）：**

![](/imgs/versatile_assistant_2.png)

## 详细步骤

以下对于相同的步骤不会赘述，对于第三方接口只介绍了【天气查询】，而【微博热榜】跟【天气查询】的步骤是一样的，只是接口和提示词不同，所以不再赘述。后文会发出完整的高级编排配置，可以导入自行查看~

### 第三方 API 获取

案例中第三方接口来源目前都是在 https://api.vvhan.com/ 里获得，里面有许多花里胡哨的接口可以用，当然你有其他的接口可以对接也可以，反正主要是返回的数据。

举个查询天气的例子：

1. 找到查询天气的 API 接口

![](/imgs/versatile_assistant_3.png)

2. 由于我想要的效果是用户可以随意问接下来一周内任意时间的天气（比如用户可以问“接下来一周的天气适合晾被子吗”），所以选择了上面接口的这个格式：https://api.vvhan.com/api/weather?city=徐州&type=week

返回 json：

```json
{"success":true,"city":"徐州市","data":[{"date":"2023-09-21","week":"星期四","type":"多云","low":"14°C","high":"24°C","fengxiang":"东北风","fengli":"3级","night":{"type":"多云","fengxiang":"南风","fengli":"3级"}},{"date":"2023-09-22","week":"星期五","type":"阴","low":"19°C","high":"25°C","fengxiang":"东风","fengli":"3级","night":{"type":"阴","fengxiang":"东风","fengli":"3级"}},{"date":"2023-09-23","week":"星期六","type":"小雨","low":"20°C","high":"23°C","fengxiang":"东北风","fengli":"3级","night":{"type":"小雨","fengxiang":"东北风","fengli":"3级"}},{"date":"2023-09-24","week":"星期日","type":"中雨","low":"20°C","high":"23°C","fengxiang":"东风","fengli":"3级","night":{"type":"中雨","fengxiang":"东北风","fengli":"3级"}},{"date":"2023-09-25","week":"星期一","type":"小雨","low":"20°C","high":"24°C","fengxiang":"北风","fengli":"3级","night":{"type":"阴","fengxiang":"北风","fengli":"3级"}},{"date":"2023-09-26","week":"星期二","type":"阴","low":"21°C","high":"27°C","fengxiang":"北风","fengli":"3级","night":{"type":"阴","fengxiang":"北风","fengli":"3级"}},{"date":"2023-09-27","week":"星期三","type":"阴","low":"21°C","high":"25°C","fengxiang":"东北风","fengli":"3级","night":{"type":"阴","fengxiang":"北风","fengli":"3级"}}]}
```

3. 由于 FastGPT 的 【http 模块】，对于返回的 json 是以对象形式接收，而我们期望得到的是上述 json 中的“data”字段，而“data”又是数组格式，无法直接丢给【AI 对话】模块（我丢过，非字符串格式报错了，不知道后面会不会更新），所以需要对其做一层中转，将“data”字段转成字符串格式。思路如此，中转方式多样，这里介绍我自己的做法：用 python 起一个服务，来负责对 API 的中转，代码如下（包含了天气接口和微博热搜接口）：

```python
from flask import Flask, request, Response
import requests
import json

app = Flask(__name__)

@app.route('/weather', methods=['GET','POST'])
def weather():
    if request.method == 'POST':
        city = request.form.get('city')
        if not city:
            data = request.get_json()
            if data:
                city = data.get('city')
    else:
        city = request.args.get('city')

    api_url = "https://api.vvhan.com/api/weather"
    # 为了方便，这里强行写死一周了，只有城市是外部传进来的
    params = {"city": city, "type": "week"}

    response = requests.get(api_url, params=params)

    res = json.loads(response.text)
    # 将data字段转成字符串格式
    res['data'] = json.dumps(res['data'], ensure_ascii=False)
    return Response(json.dumps(res, ensure_ascii=False), mimetype="application/json")

@app.route('/wbhot', methods=['GET','POST'])
def wbhot():
    api_url = "https://api.vvhan.com/api/wbhot"

    response = requests.get(api_url)

    res = json.loads(response.text)
    # 只返回前10条热搜（免得数据太多耗token）
    res['data'] = res['data'][:10]
    # 将data字段转成字符串格式
    res['data'] = json.dumps(res['data'], ensure_ascii=False)
    return Response(json.dumps(res, ensure_ascii=False), mimetype="application/json")

if __name__ == '__main__':
    #部署在3017端口，可自行修改
    app.run(host='0.0.0.0', port=3017)
```

4. 接口测试返回数据：

```json
{"success": true, "city": "广州市", "data": "[{\"date\": \"2023-09-21\", \"week\": \"星期四\", \"type\": \"雷阵雨\", \"low\": \"25°C\", \"high\": \"34°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"雷阵雨\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}, {\"date\": \"2023-09-22\", \"week\": \"星期五\", \"type\": \"雷阵雨\", \"low\": \"25°C\", \"high\": \"32°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"多云\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}, {\"date\": \"2023-09-23\", \"week\": \"星期六\", \"type\": \"多云\", \"low\": \"25°C\", \"high\": \"32°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"多云\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}, {\"date\": \"2023-09-24\", \"week\": \"星期日\", \"type\": \"多云\", \"low\": \"25°C\", \"high\": \"34°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"多云\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}, {\"date\": \"2023-09-25\", \"week\": \"星期一\", \"type\": \"多云\", \"low\": \"25°C\", \"high\": \"34°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"多云\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}, {\"date\": \"2023-09-26\", \"week\": \"星期二\", \"type\": \"多云\", \"low\": \"25°C\", \"high\": \"34°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"多云\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}, {\"date\": \"2023-09-27\", \"week\": \"星期三\", \"type\": \"中雨\", \"low\": \"26°C\", \"high\": \"33°C\", \"fengxiang\": \"微风\", \"fengli\": \"3级\", \"night\": {\"type\": \"中雨\", \"fengxiang\": \"微风\", \"fengli\": \"3级\"}}]"}
```

### 用户问题分类

第一步就是对用户问题进行分类，如图红框部分：

![](/imgs/versatile_assistant_4.png)

### 接口参数获取及处理

**数据获取：**

由于天气接口需要传入的是“城市”字段，所以需要我们从用户的问题中提取出“城市”字段，所以【文本内容提取】模块登场。

提取要求描述（自行调试另一个 prompt 也行）：

```
你是一个天气查询助手。根据用户问题，提取出城市。注意不是简单的文本提取，而是上下文理解后的提取。如果用户问题中不包含城市则不提取
```

目标字段：城市

**数据处理：**

1. 设计一个好用的功能往往需要把用户当成小白，所以用户的问题中很可能是没有我们需要的参数的，所以当“提取字段缺失”时，我们需要【指定回复】模块来提示用户输入城市
2. 若提取成功，则将提取出来的“城市”发给 http 模块

如图：

![](/imgs/versatile_assistant_5.png)

### AI 总结回复

上述步骤已经拿到了天气的 json 结果，但我们需要的是语义化的结果，所以就要把“json 结果”、“当前时间”（方便用户问今天还是明天天气时可以判断）、“上下文聊天记录”（方便用户的问题涉及上下文关联时能区分）这三个参数传给【AI 对话】模块，让它来总结回复。
限定词（我自己调试的，你有更好的也可以替换）：

```
已知条件：1. 当前时间是{{cTime}}；2. 这份json数据是要询问的地方的天气数据，比如用户问的是“北京”的天气，那这份json就是“北京”的天气数据。

现在请自行解析json后回复用户
```

如图：

![](/imgs/versatile_assistant_6.png)

## 模块编排

复制下面配置，点击「高级编排」右上角的导入按键，导入该配置。

PS1：接口的第三方域名已打码，需要自行替换

PS2：配置中的问题分类还包含着“联网搜索”，这个是另一个案例中整合进来的，这里不做介绍，有兴趣看另一篇“联网 GPT”案例。没兴趣也可以在问题分类中删掉这个分支

{{% details title="编排配置" closed="true" %}}

```json
[
  {
    "moduleId": "userChatInput",
    "name": "用户问题(对话入口)",
    "flowType": "questionInput",
    "position": {
      "x": 464.32198615344566,
      "y": 1602.2698463081606
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
            "moduleId": "toho1d",
            "key": "userChatInput"
          },
          {
            "moduleId": "rov9zf",
            "key": "content"
          },
          {
            "moduleId": "6q1n0a",
            "key": "userChatInput"
          },
          {
            "moduleId": "i0u1iy",
            "key": "userChatInput"
          },
          {
            "moduleId": "uo68aj",
            "key": "userChatInput"
          },
          {
            "moduleId": "3k4zw1",
            "key": "content"
          },
          {
            "moduleId": "01fwnb",
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
      "x": 452.5466249541586,
      "y": 1276.3930310334215
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
            "moduleId": "toho1d",
            "key": "history"
          },
          {
            "moduleId": "6q1n0a",
            "key": "history"
          },
          {
            "moduleId": "rov9zf",
            "key": "history"
          },
          {
            "moduleId": "uo68aj",
            "key": "history"
          },
          {
            "moduleId": "3k4zw1",
            "key": "history"
          },
          {
            "moduleId": "01fwnb",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "toho1d",
    "name": "问题分类",
    "flowType": "classifyQuestion",
    "showStatus": true,
    "position": {
      "x": 942.1068912757241,
      "y": 1044.6701989335747
    },
    "inputs": [
      {
        "key": "systemPrompt",
        "type": "textarea",
        "valueType": "string",
        "value": "",
        "label": "系统提示词",
        "description": "你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。",
        "placeholder": "例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统",
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
      },
      {
        "key": "agents",
        "type": "custom",
        "label": "",
        "value": [
          {
            "value": "询问天气",
            "key": "fasw"
          },
          {
            "value": "其它问题",
            "key": "wl9i"
          },
          {
            "value": "微博热榜",
            "key": "sf09"
          },
          {
            "value": "联网搜索",
            "key": "6p8b"
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
            "moduleId": "rov9zf",
            "key": "switch"
          }
        ]
      },
      {
        "key": "fqsw",
        "label": "",
        "type": "hidden",
        "targets": []
      },
      {
        "key": "fesw",
        "label": "",
        "type": "hidden",
        "targets": []
      },
      {
        "key": "wl9i",
        "label": "",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "i0u1iy",
            "key": "switch"
          }
        ]
      },
      {
        "key": "sf09",
        "label": "",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "3m320f",
            "key": "switch"
          }
        ]
      },
      {
        "key": "6p8b",
        "label": "",
        "type": "hidden",
        "targets": [
          {
            "moduleId": "3k4zw1",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "rov9zf",
    "name": "文本内容提取",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 1632.5948304111266,
      "y": 331.84468967718163
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
        "value": "你是一个天气查询助手。根据用户问题，提取出城市。注意不是简单的文本提取，而是上下文理解后的提取。如果用户问题中不包含城市则不提取",
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
            "desc": "城市",
            "key": "city",
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
        "targets": [
          {
            "moduleId": "4gy7tw",
            "key": "switch"
          }
        ]
      },
      {
        "key": "failed",
        "label": "提取字段缺失",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "eu1xhx",
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
        "key": "city",
        "label": "提取结果-城市",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": [
          {
            "moduleId": "4gy7tw",
            "key": "city"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "eu1xhx",
    "name": "指定回复",
    "flowType": "answerNode",
    "position": {
      "x": 2137.9125850753494,
      "y": 326.06694967444105
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
        "value": "请告诉我你要查询的是哪个城市的天气",
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
    "moduleId": "4gy7tw",
    "name": "HTTP模块",
    "flowType": "httpRequest",
    "showStatus": true,
    "position": {
      "x": 2156.411722495609,
      "y": 661.4677041198821
    },
    "inputs": [
      {
        "key": "url",
        "value": "http://api.xxx.cn/weather",
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
        "connected": true
      },
      {
        "valueType": "string",
        "type": "target",
        "label": "城市",
        "edit": true,
        "required": false,
        "connected": true,
        "key": "city"
      }
    ],
    "outputs": [
      {
        "label": "结果",
        "valueType": "string",
        "type": "source",
        "edit": true,
        "targets": [
          {
            "moduleId": "6q1n0a",
            "key": "systemPrompt"
          }
        ],
        "key": "data"
      },
      {
        "key": "finish",
        "label": "请求结束",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "6q1n0a",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "6q1n0a",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2771.9325168087653,
      "y": 262.8526145591803
    },
    "inputs": [
      {
        "key": "model",
        "type": "custom",
        "label": "对话模型",
        "value": "gpt-3.5-turbo",
        "list": [
          {
            "label": "GPT35-4k",
            "value": "gpt-3.5-turbo"
          },
          {
            "label": "GPT35-16k",
            "value": "gpt-3.5-turbo-16k"
          },
          {
            "label": "GPT4-8k",
            "value": "gpt-4"
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
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "引用内容模板",
        "valueType": "string",
        "value": "",
        "connected": true
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
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
        "type": "custom",
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
      },
      {
        "key": "limitPrompt",
        "type": "textarea",
        "valueType": "string",
        "label": "限定词",
        "description": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "placeholder": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "value": "已知条件：1. 当前时间是{{cTime}}；2. 这份json数据是要询问的地方的天气数据，比如用户问的是“北京”的天气，那这份json就是“北京”的天气数据。\n\n现在请自行解析json后回复用户",
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
    "moduleId": "i0u1iy",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 1636.416225126142,
      "y": 1243.2398251366028
    },
    "inputs": [
      {
        "key": "model",
        "type": "custom",
        "label": "对话模型",
        "value": "gpt-3.5-turbo",
        "list": [
          {
            "label": "GPT35-4k",
            "value": "gpt-3.5-turbo"
          },
          {
            "label": "GPT35-16k",
            "value": "gpt-3.5-turbo-16k"
          },
          {
            "label": "GPT4-8k",
            "value": "gpt-4"
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
        "value": 4000,
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
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "引用内容模板",
        "valueType": "string",
        "value": "",
        "connected": true
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
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
        "type": "custom",
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
    "moduleId": "3m320f",
    "name": "HTTP模块",
    "flowType": "httpRequest",
    "showStatus": true,
    "position": {
      "x": 1640.5198770218628,
      "y": 2420.3111570417573
    },
    "inputs": [
      {
        "key": "url",
        "value": "http://api.xxx.cn/wbhot",
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
        "connected": true
      }
    ],
    "outputs": [
      {
        "label": "data",
        "valueType": "string",
        "type": "source",
        "edit": true,
        "targets": [
          {
            "moduleId": "uo68aj",
            "key": "systemPrompt"
          }
        ],
        "key": "data"
      },
      {
        "key": "finish",
        "label": "请求结束",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "uo68aj",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "uo68aj",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2248.9999960823247,
      "y": 2411.459363346701
    },
    "inputs": [
      {
        "key": "model",
        "type": "custom",
        "label": "对话模型",
        "value": "gpt-3.5-turbo-16k",
        "list": [
          {
            "label": "GPT35-4k",
            "value": "gpt-3.5-turbo"
          },
          {
            "label": "GPT35-16k",
            "value": "gpt-3.5-turbo-16k"
          },
          {
            "label": "GPT4-8k",
            "value": "gpt-4"
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
        "value": 16000,
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
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "引用内容模板",
        "valueType": "string",
        "value": "",
        "connected": true
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
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
        "type": "custom",
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
      },
      {
        "key": "limitPrompt",
        "type": "textarea",
        "valueType": "string",
        "label": "限定词",
        "description": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "placeholder": "限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。可使用变量，例如 {{language}}。引导例子:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 \"Laf\" 无关内容，直接回复: \"我不知道\"。\n2. 你仅回答关于 \"xxx\" 的问题，其他问题回复: \"xxxx\"",
        "value": "以上json数据是当前的微博热榜数据，回答的时候用markdown格式，只需回复热搜标题的前10即可",
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
    "moduleId": "qoccls",
    "name": "聊天记录",
    "flowType": "historyNode",
    "position": {
      "x": 448.94080110453046,
      "y": 990.48670949044
    },
    "inputs": [
      {
        "key": "maxContext",
        "type": "numberInput",
        "label": "最长记录数",
        "value": 50,
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
            "moduleId": "i0u1iy",
            "key": "history"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "3k4zw1",
    "name": "文本内容提取",
    "flowType": "contentExtract",
    "showStatus": true,
    "position": {
      "x": 1608.4732867173993,
      "y": 3651.5738821560017
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
        "value": "你是谷歌搜索机器人，可以生成搜索词。你需要自行判断是否需要生成搜索词，如果不需要则返回空字符串。",
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
            "desc": "搜索词",
            "key": "searchKey",
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
        "key": "searchKey",
        "label": "提取结果-搜索词",
        "description": "无法提取时不会返回",
        "valueType": "string",
        "type": "source",
        "targets": [
          {
            "moduleId": "3ojl65",
            "key": "searchKey"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "3ojl65",
    "name": "HTTP模块",
    "flowType": "httpRequest",
    "showStatus": true,
    "position": {
      "x": 2250.5435150325084,
      "y": 3647.785854643283
    },
    "inputs": [
      {
        "key": "url",
        "value": "http://api.xxx.cn/google",
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
        "label": "搜索词",
        "edit": true,
        "key": "searchKey",
        "required": true,
        "connected": true
      }
    ],
    "outputs": [
      {
        "label": "搜索词",
        "valueType": "string",
        "type": "source",
        "edit": true,
        "targets": [],
        "key": "searchKey"
      },
      {
        "label": "搜索结果",
        "valueType": "string",
        "type": "source",
        "edit": true,
        "targets": [
          {
            "moduleId": "01fwnb",
            "key": "systemPrompt"
          }
        ],
        "key": "prompt"
      },
      {
        "key": "finish",
        "label": "请求结束",
        "valueType": "boolean",
        "type": "source",
        "targets": [
          {
            "moduleId": "01fwnb",
            "key": "switch"
          }
        ]
      }
    ]
  },
  {
    "moduleId": "01fwnb",
    "name": "AI 对话",
    "flowType": "chatNode",
    "showStatus": true,
    "position": {
      "x": 2913.2501313416833,
      "y": 3642.3449136226823
    },
    "inputs": [
      {
        "key": "model",
        "type": "custom",
        "label": "对话模型",
        "value": "gpt-3.5-turbo-16k",
        "list": [
          {
            "label": "GPT35-4k",
            "value": "gpt-3.5-turbo"
          },
          {
            "label": "GPT35-16k",
            "value": "gpt-3.5-turbo-16k"
          },
          {
            "label": "GPT4-8k",
            "value": "gpt-4"
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
        "value": 16000,
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
        "key": "quoteTemplate",
        "type": "hidden",
        "label": "引用内容模板",
        "valueType": "string",
        "value": "",
        "connected": true
      },
      {
        "key": "quotePrompt",
        "type": "hidden",
        "label": "引用内容提示词",
        "valueType": "string",
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
        "type": "custom",
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
    "moduleId": "kq35bj",
    "name": "用户引导",
    "flowType": "userGuide",
    "position": {
      "x": 359.84546622310677,
      "y": 686.3487640909323
    },
    "inputs": [
      {
        "key": "welcomeText",
        "type": "input",
        "label": "开场白",
        "value": "你好，我是你的全能助手，目前我拥有【查询天气】、【查看微博热搜】、【智能聊天】功能。来跟我对话吧~",
        "connected": true
      }
    ],
    "outputs": []
  }
]
```

{{% /details %}}

## 效果图

![](/imgs/versatile_assistant_7.png)

## 后记

1. 案例中的提示词不一定完美，如果有出现抽风的情况，可以自行调整提示词。
2. 查询天气的 ai 对话，为了省 token 我用的是 GPT3.5，按理说 GPT4 理解力会高点，可以自行试试。
3. 本案例中采用了“限定词”的方式引导 【AI 对话】模块，但最新版好像不支持限定词了（当然导入配置是没问题的），大家可以自行研究下新版的用法~
