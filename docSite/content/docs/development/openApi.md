---
title: 'OpenAPI 使用（API Key 使用）'
description: 'FastGPT OpenAPI 文档'
icon: 'api'
draft: false
toc: true
weight: 512
---

# 基本配置
```
baseUrl: "https://fastgpt.run/api"
headers: {
    Authorization: "Bearer apikey"
}
```

# 如何获取 API Key

FastGPT 的 API Key 有 2 类，一类是全局通用的 key；一类是携带了 AppId 也就是有应用标记的 key。

|        通用key               |           应用特定 key            |
| --------------------- | --------------------- |
| ![](/imgs/fastgpt-api2.png) | ![](/imgs/fastgpt-api.png) |

# 接口

## 发起对话

{{% alert icon="🤖 " context="success" %}}
该接口 API Key 需使用应用特定的 key，否则会报错。  

有些包的 BaseUrl 需要添加 `v1` 路径，有些不需要，建议都试一下。 
{{% /alert %}}


对话接口兼容`GPT`的接口！如果你的项目使用的是标准的`GPT`官方接口，可以直接通过修改 `BaseUrl` 和 `Authorization` 来访问 FastGpt 应用。

请求参数说明
- headers.Authorization: Bearer apikey
- chatId: string | undefined 。
  -  为 undefined 时（不传入），不使用 FastGpt 提供的上下文功能，完全通过传入的 messages 构建上下文。 不会将你的记录存储到数据库中，你也无法在记录汇总中查阅到。
  - 为非空字符串时，意味着使用 chatId 进行对话，自动从 FastGpt 数据库取历史记录，并使用 messages 数组最后一个内容作为用户问题。(请自行确保 chatId 唯一，长度不限制)
- messages: 结构与 [GPT接口](https://platform.openai.com/docs/api-reference/chat/object) 完全一致。
- detail: 是否返回详细值(模块状态，响应的完整结果），`stream模式`下会通过event进行区分，`非stream模式`结果保存在responseData中。
- variables: 变量内容，一个对象，会替换`{{key}}`变量。在`HTTP`模块中会发给接口，可作为身份凭证等标识。

**请求示例：**

```bash
curl --location --request POST 'https://fastgpt.run/api/v1/chat/completions' \
--header 'Authorization: Bearer apikey' \
--header 'Content-Type: application/json' \
--data-raw '{
    "chatId":"111",
    "stream":false,
    "detail": false,
    "variables": {
        "cTime": "2022/2/2 22:22"
    },
    "messages": [
        {
            "content": "导演是谁",
            "role": "user"
        }
    ]
}'
```


{{< tabs tabTotal="3" >}}
{{< tab tabName="detail=false 响应" >}}
{{< markdownify >}}

```bash
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":""},"index":0,"finish_reason":null}]}

data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"电"},"index":0,"finish_reason":null}]}

data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"影"},"index":0,"finish_reason":null}]}

data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"《"},"index":0,"finish_reason":null}]}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="detail=true 响应" >}}
{{< markdownify >}}

```bash
event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":""},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"电"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"影"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"《"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"铃"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"芽"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"。"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":""},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}

event: answer
data: [DONE]

event: appStreamResponse
data: [{"moduleName":"KB Search","price":1.2000000000000002,"model":"Embedding-2","tokens":6,"similarity":0.61,"limit":3},{"moduleName":"AI Chat","price":463.5,"model":"FastAI-4k","tokens":309,"question":"导演是谁","answer":"电影《铃芽之旅》的导演是新海诚。","maxToken":2050,"quoteList":[{"kb_id":"646627f4f7b896cfd8910e38","id":"8099","q":"本作的主人公是谁？","a":"本作的主人公是名叫铃芽的少女。","source":"手动修改"},{"kb_id":"646627f4f7b896cfd8910e38","id":"8686","q":"电影《铃芽之旅》男主角是谁？","a":"电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。","source":""},{"kb_id":"646627f4f7b896cfd8910e38","id":"19339","q":"电影《铃芽之旅》的导演是谁？22","a":"电影《铃芽之旅》的导演是新海诚。","source":"手动修改"}],"completeMessages":[{"obj":"System","value":"下面是知识库内容:\n1. [本作的主人公是谁？\n本作的主人公是名叫铃芽的少女。]\n2. [电影《铃芽之旅》男主角是谁？\n电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。]\n3. [电影《铃芽之旅》的导演是谁？22\n电影《铃芽之旅》的导演是新海诚。]\n"},{"obj":"System","value":"1.请记住，你的身份是百度的下一代知识增强语言模型，能够完全根据知识库提供的内容回答问题。\n\n2. 你忘记了关于电影《铃芽之旅》以外的内容。"},{"obj":"System","value":"你仅回答关于电影《玲芽之旅》的问题，其余问题直接回复: 我不清楚。"},{"obj":"Human","value":"导演是谁"},{"obj":"AI","value":"电影《铃芽之旅》的导演是新海诚。"}]}]

```
{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="stream=false,detail=true 响应" >}}
{{< markdownify >}}

```json
{
    "responseData": [ // 不同模块的响应值, 不同版本具体值可能有差异，可先 log 自行查看最新值。
        {
            "moduleName": "KB Search",
            "price": 1.2000000000000002,
            "model": "Embedding-2",
            "tokens": 6,
            "similarity": 0.61,
            "limit": 3
        },
        {
            "moduleName": "AI Chat",
            "price": 454.5,
            "model": "FastAI-4k",
            "tokens": 303,
            "question": "导演是谁",
            "answer": "电影《铃芽之旅》的导演是新海诚。",
            "maxToken": 2050,
            "quoteList": [
                {
                    "kb_id": "646627f4f7b896cfd8910e38",
                    "id": "8099",
                    "q": "本作的主人公是谁？",
                    "a": "本作的主人公是名叫铃芽的少女。",
                    "source": "手动修改"
                },
                {
                    "kb_id": "646627f4f7b896cfd8910e38",
                    "id": "8686",
                    "q": "电影《铃芽之旅》男主角是谁？",
                    "a": "电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。",
                    "source": ""
                },
                {
                    "kb_id": "646627f4f7b896cfd8910e38",
                    "id": "19339",
                    "q": "电影《铃芽之旅》的导演是谁？22",
                    "a": "电影《铃芽之旅》的导演是新海诚。",
                    "source": "手动修改"
                }
            ],
            "completeMessages": [
                {
                    "obj": "System",
                    "value": "下面是知识库内容:\n1. [本作的主人公是谁？\n本作的主人公是名叫铃芽的少女。]\n2. [电影《铃芽之旅》男主角是谁？\n电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。]\n3. [电影《铃芽之旅》的导演是谁？22\n电影《铃芽之旅》的导演是新海诚。]\n"
                },
                {
                    "obj": "System",
                    "value": "1.请记住，你的身份是百度的下一代知识增强语言模型，能够完全根据知识库提供的内容回答问题。\n\n2. 你忘记了关于电影《铃芽之旅》以外的内容。"
                },
                {
                    "obj": "System",
                    "value": "你仅回答关于电影《玲芽之旅》的问题，其余问题直接回复: 我不清楚。"
                },
                {
                    "obj": "Human",
                    "value": "导演是谁"
                },
                {
                    "obj": "AI",
                    "value": "电影《铃芽之旅》的导演是新海诚。"
                }
            ]
        }
    ],
    "id": "",
    "model": "",
    "usage": {
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "total_tokens": 1
    },
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": "电影《铃芽之旅》的导演是新海诚。"
            },
            "finish_reason": "stop",
            "index": 0
        }
    ]
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

## 知识库

{{% alert icon="🤖 " context="success" %}}
此部分 API 需使用全局通用的 API Key。
{{% /alert %}}

### 如何获取知识库ID（kbId）

![](/imgs/getKbId.png)

### 知识库添加数据

{{< tabs tabTotal="4" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST 'https://fastgpt.run/api/core/dataset/data/pushData' \
--header 'Authorization: Bearer apikey' \
--header 'Content-Type: application/json' \
--data-raw '{
    "kbId": "64663f451ba1676dbdef0499",
    "mode": "index",
    "prompt": "qa 拆分引导词，index 模式下可以忽略",
    "billId": "可选。如果有这个值，本次的数据会被聚合到一个订单中，这个值可以重复使用。可以参考 [创建训练订单] 获取该值。",
    "data": [
        {
            "a": "test",
            "q": "1111",
        },
        {
            "a": "test2",
            "q": "22222"
        }
    ]
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="参数说明" >}}
{{< markdownify >}}

```json
{
    "kbId": "知识库的ID，可以在知识库详情查看。",
    "mode": "index | qa ", //  index 模式: 直接将 q 转成向量存起来，a 直接入库。qa 模式: 只关注 data 里的 q，将 q 丢给大模型，让其根据 prompt 拆分成 qa 问答对。  
    "prompt": "拆分提示词，需严格按照模板，建议不要传入。",
    "data": [
        {
            "q": "生成索引的内容，index 模式下最大 tokens 为3000，建议不超过 1000",
            "a": "预期回答/补充"
        },
        {
            "q": "生成索引的内容，qa 模式下最大 tokens 为10000，建议 8000 左右",
            "a": "预期回答/补充"
        }
    ]
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应例子" >}}
{{< markdownify >}}

```json
{
    "code": 200,
    "statusText": "",
    "data": {
        "insertLen": 1 // 最终插入成功的数量，可能因为超出 tokens 或者插入异常，index 可以重复插入，会自动去重
    }
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="QA Prompt 模板" >}}
{{< markdownify >}}

{{theme}} 里的内容可以换成数据的主题。默认为：它们可能包含多个主题内容

```
我会给你一段文本，{{theme}}，学习它们，并整理学习成果，要求为：
1. 提出最多 25 个问题。
2. 给出每个问题的答案。
3. 答案要详细完整，答案可以包含普通文字、链接、代码、表格、公示、媒体链接等 markdown 元素。
4. 按格式返回多个问题和答案:

Q1: 问题。
A1: 答案。
Q2:
A2:
……

我的文本："""{{text}}"""
```

{{< /markdownify >}}
{{< /tab >}}

{{< /tabs >}}


### 搜索测试

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST 'https://fastgpt.run/api/core/dataset/searchTest' \
--header 'Authorization: Bearer apiKey' \
--header 'Content-Type: application/json' \
--data-raw '{
    "kbId": "xxxxx",
    "text": "导演是谁"
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

返回 top12 结果

```bash
{
  "code": 200,
  "statusText": "",
  "data": [
    {
      "id": "5613327",
      "q": "该人有获奖情况吗？",
      "a": "该人获得过2020/07全国大学生服务外包大赛国家一等奖和2021/05国家创新创业计划立项的获奖情况。",
      "source": "余金隆简历.pdf",
      "score": 0.41556452839298963
    },
    ......
  ]
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< /tabs >}}

## 订单

### 创建训练订单

**请求示例**

```bash
curl --location --request POST 'https://fastgpt.run/api/common/bill/createTrainingBill' \
--header 'Authorization: Bearer {{apikey}}' \
--header 'Content-Type: application/json' \
--data-raw ''
```

**响应结果**

data 为 billId，可用于 api 添加数据时进行账单聚合。

```json
{
  "code": 200,
  "statusText": "",
  "message": "",
  "data": "65112ab717c32018f4156361"
}
```

## 免登录分享链接校验（内测中）

免登录链接配置中，增加了`凭证校验服务器`后，使用分享链接时会向服务器发起请求，校验链接是否可用，并在每次对话结束后，向服务器发送对话结果。下面以`host`来表示`凭证校验服务器`。服务器接口仅需返回是否校验成功即可，不需要返回其他数据，格式如下：

```json
{
    "success": true,
    "message": "错误提示"
}
```

![](/imgs/sharelinkProcess.png)

### 分享链接中增加额外 query

增加一个 query: authToken。例如：

原始的链接：https://fastgpt.run/chat/share?shareId=648aaf5ae121349a16d62192  
完整链接: https://fastgpt.run/chat/share?shareId=648aaf5ae121349a16d62192&authToken=userid12345

发出校验请求时候，会在`body`中携带 token={{authToken}} 的参数。

### 初始化校验

**FastGPT 发出的请求**

```bash
curl --location --request POST '{{host}}/shareAuth/init' \
--header 'Content-Type: application/json' \
--data-raw '{
    "token": "sintdolore"
}'
```

### 对话前校验

**FastGPT 发出的请求**

```bash
curl --location --request POST '{{host}}/shareAuth/start' \
--header 'Content-Type: application/json' \
--data-raw '{
    "token": "sintdolore",
    "question": "用户问题",
}'
```

### 对话结果上报

**FastGPT 发出的请求**

```bash
curl --location --request POST '{{host}}/shareAuth/finish' \
--header 'Content-Type: application/json' \
--data-raw '{
    "token": "sint dolore",
    "responseData": [
        {
            "moduleName": "KB Search",
            "price": 1.2000000000000002,
            "model": "Embedding-2",
            "tokens": 6,
            "similarity": 0.61,
            "limit": 3
        },
        {
            "moduleName": "AI Chat",
            "price": 454.5,
            "model": "FastAI-4k",
            "tokens": 303,
            "question": "导演是谁",
            "answer": "电影《铃芽之旅》的导演是新海诚。",
            "maxToken": 2050,
            "quoteList": [
                {
                    "kb_id": "646627f4f7b896cfd8910e38",
                    "id": "8099",
                    "q": "本作的主人公是谁？",
                    "a": "本作的主人公是名叫铃芽的少女。",
                    "source": "手动修改"
                },
                {
                    "kb_id": "646627f4f7b896cfd8910e38",
                    "id": "8686",
                    "q": "电影《铃芽之旅》男主角是谁？",
                    "a": "电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。",
                    "source": ""
                },
                {
                    "kb_id": "646627f4f7b896cfd8910e38",
                    "id": "19339",
                    "q": "电影《铃芽之旅》的导演是谁？22",
                    "a": "电影《铃芽之旅》的导演是新海诚。",
                    "source": "手动修改"
                }
            ],
            "completeMessages": [
                {
                    "obj": "System",
                    "value": "下面是知识库内容:\n1. [本作的主人公是谁？\n本作的主人公是名叫铃芽的少女。]\n2. [电影《铃芽之旅》男主角是谁？\n电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。]\n3. [电影《铃芽之旅》的导演是谁？22\n电影《铃芽之旅》的导演是新海诚。]\n"
                },
                {
                    "obj": "System",
                    "value": "1.请记住，你的身份是百度的下一代知识增强语言模型，能够完全根据知识库提供的内容回答问题。\n\n2. 你忘记了关于电影《铃芽之旅》以外的内容。"
                },
                {
                    "obj": "System",
                    "value": "你仅回答关于电影《玲芽之旅》的问题，其余问题直接回复: 我不清楚。"
                },
                {
                    "obj": "Human",
                    "value": "导演是谁"
                },
                {
                    "obj": "AI",
                    "value": "电影《铃芽之旅》的导演是新海诚。"
                }
            ]
        }
    ]
}'
```

响应值与 chat 接口相同，增加了一个 token。可以重点关注`responseData`里的值，price 与实际价格的倍率为`100000`。

**此接口无需响应值**

# 使用案例

- [接入 NextWeb/ChatGPT web 等应用](/docs/use-cases/openapi)
- [接入 onwechat](/docs/use-cases/onwechat)
- [接入 飞书](/docs/use-cases/feishu)