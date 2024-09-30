---
title: '对话接口'
description: 'FastGPT OpenAPI 对话接口'
icon: 'chat'
draft: false
toc: true
weight: 852
---

{{% alert icon="🤖 " context="success" %}}
* 该接口的 API Key 需使用`应用特定的 key`，否则会报错。  

* 有些包调用时，`BaseUrl`需要添加`v1`路径，有些不需要，如果出现404情况，可补充`v1`重试。
{{% /alert %}}

## 发起对话(简易应用和工作流)

对话接口兼容`GPT`的接口！如果你的项目使用的是标准的`GPT`官方接口，可以直接通过修改`BaseUrl`和 `Authorization`来访问 FastGpt 应用，不过需要注意下面几个规则：

{{% alert icon="🤖 " context="success" %}}
* 传入的`model`，`temperature`等参数字段均无效，这些字段由编排决定，不会根据 API 参数改变。
* 不会返回实际消耗`Token`值，如果需要，可以设置`detail=true`，并手动计算 `responseData` 里的`tokens`值。
{{% /alert %}}

### 请求

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST 'https://api.fastgpt.in/api/v1/chat/completions' \
--header 'Authorization: Bearer fastgpt-xxxxxx' \
--header 'Content-Type: application/json' \
--data-raw '{
    "chatId": "abcd",
    "stream": false,
    "detail": false,
    "variables": {
        "uid": "asdfadsfasfd2323",
        "name": "张三"
    },
    "messages": [
        {
            "content": "导演是谁",
            "role": "user"
        }
    ]
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="参数说明" >}}
{{< markdownify >}}

{{% alert context="info" %}}
- headers.Authorization: Bearer {{apikey}}
- chatId: string | undefined 。
  - 为 `undefined` 时（不传入），不使用 FastGpt 提供的上下文功能，完全通过传入的 messages 构建上下文。 不会将你的记录存储到数据库中，你也无法在记录汇总中查阅到。
  - 为`非空字符串`时，意味着使用 chatId 进行对话，自动从 FastGpt 数据库取历史记录，并使用 messages 数组最后一个内容作为用户问题。请自行确保 chatId 唯一，长度小于250，通常可以是自己系统的对话框ID。
- messages: 结构与 [GPT接口](https://platform.openai.com/docs/api-reference/chat/object) chat模式一致。
- detail: 是否返回中间值（模块状态，响应的完整结果等），`stream模式`下会通过`event`进行区分，`非stream模式`结果保存在`responseData`中。
- variables: 模块变量，一个对象，会替换模块中，输入框内容里的`{{key}}`
{{% /alert %}}



{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

### 响应

{{< tabs tabTotal="5" >}}
{{< tab tabName="detail=false,stream=false 响应" >}}
{{< markdownify >}}

```json
{
    "id": "adsfasf",
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

{{< tab tabName="detail=false,stream=true 响应" >}}
{{< markdownify >}}


```bash
data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":""},"index":0,"finish_reason":null}]}

data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"电"},"index":0,"finish_reason":null}]}

data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"影"},"index":0,"finish_reason":null}]}

data: {"id":"","object":"","created":0,"choices":[{"delta":{"content":"《"},"index":0,"finish_reason":null}]}
```
{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="detail=true,stream=false 响应" >}}
{{< markdownify >}}

```json
{
    "responseData": [ // 不同模块的响应值, 不同版本具体值可能有差异，可先 log 自行查看最新值。
        {
            "moduleName": "Dataset Search",
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
                    "dataset_id": "646627f4f7b896cfd8910e38",
                    "id": "8099",
                    "q": "本作的主人公是谁？",
                    "a": "本作的主人公是名叫铃芽的少女。",
                    "source": "手动修改"
                },
                {
                    "dataset_id": "646627f4f7b896cfd8910e38",
                    "id": "8686",
                    "q": "电影《铃芽之旅》男主角是谁？",
                    "a": "电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。",
                    "source": ""
                },
                {
                    "dataset_id": "646627f4f7b896cfd8910e38",
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


{{< tab tabName="detail=true,stream=true 响应" >}}
{{< markdownify >}}

```bash
event: flowNodeStatus
data: {"status":"running","name":"知识库搜索"}

event: flowNodeStatus
data: {"status":"running","name":"AI 对话"}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"content":"电影"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"content":"《铃"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"content":"芽之旅》"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"content":"的导演是新"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"content":"海诚。"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}

event: answer
data: [DONE]

event: flowResponses
data: [{"moduleName":"知识库搜索","moduleType":"datasetSearchNode","runningTime":1.78},{"question":"导演是谁","quoteList":[{"id":"654f2e49b64caef1d9431e8b","q":"电影《铃芽之旅》的导演是谁？","a":"电影《铃芽之旅》的导演是新海诚!","indexes":[{"type":"qa","dataId":"3515487","text":"电影《铃芽之旅》的导演是谁？","_id":"654f2e49b64caef1d9431e8c","defaultIndex":true}],"datasetId":"646627f4f7b896cfd8910e38","collectionId":"653279b16cd42ab509e766e8","sourceName":"data (81).csv","sourceId":"64fd3b6423aa1307b65896f6","score":0.8935586214065552},{"id":"6552e14c50f4a2a8e632af11","q":"导演是谁？","a":"电影《铃芽之旅》的导演是新海诚。","indexes":[{"defaultIndex":true,"type":"qa","dataId":"3644565","text":"导演是谁？\n电影《铃芽之旅》的导演是新海诚。","_id":"6552e14dde5cc7ba3954e417"}],"datasetId":"646627f4f7b896cfd8910e38","collectionId":"653279b16cd42ab509e766e8","sourceName":"data (81).csv","sourceId":"64fd3b6423aa1307b65896f6","score":0.8890955448150635},{"id":"654f34a0b64caef1d946337e","q":"本作的主人公是谁？","a":"本作的主人公是名叫铃芽的少女。","indexes":[{"type":"qa","dataId":"3515541","text":"本作的主人公是谁？","_id":"654f34a0b64caef1d946337f","defaultIndex":true}],"datasetId":"646627f4f7b896cfd8910e38","collectionId":"653279b16cd42ab509e766e8","sourceName":"data (81).csv","sourceId":"64fd3b6423aa1307b65896f6","score":0.8738770484924316},{"id":"654f3002b64caef1d944207a","q":"电影《铃芽之旅》男主角是谁？","a":"电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。","indexes":[{"type":"qa","dataId":"3515538","text":"电影《铃芽之旅》男主角是谁？","_id":"654f3002b64caef1d944207b","defaultIndex":true}],"datasetId":"646627f4f7b896cfd8910e38","collectionId":"653279b16cd42ab509e766e8","sourceName":"data (81).csv","sourceId":"64fd3b6423aa1307b65896f6","score":0.8607980012893677},{"id":"654f2fc8b64caef1d943fd46","q":"电影《铃芽之旅》的编剧是谁？","a":"新海诚是本片的编剧。","indexes":[{"defaultIndex":true,"type":"qa","dataId":"3515550","text":"电影《铃芽之旅》的编剧是谁？22","_id":"654f2fc8b64caef1d943fd47"}],"datasetId":"646627f4f7b896cfd8910e38","collectionId":"653279b16cd42ab509e766e8","sourceName":"data (81).csv","sourceId":"64fd3b6423aa1307b65896f6","score":0.8468944430351257}],"moduleName":"AI 对话","moduleType":"chatNode","runningTime":1.86}]
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="event值" >}}
{{< markdownify >}}

event取值：

- answer: 返回给客户端的文本（最终会算作回答）
- fastAnswer: 指定回复返回给客户端的文本（最终会算作回答）
- toolCall: 执行工具
- toolParams: 工具参数
- toolResponse: 工具返回
- flowNodeStatus: 运行到的节点状态
- flowResponses: 节点完整响应
- updateVariables: 更新变量
- error: 报错

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}



## 请求插件

插件的接口与对话接口一致，仅请求参数略有区别，有以下规定：

* 调用插件类型的应用时，接口默认为`detail`模式。
* 无需传入 `chatId`，因为插件只能运行一轮。
* 无需传入`messages`。
* 通过传递`variables`来代表插件的输入。
* 通过获取`pluginData`来获取插件输出。

### 请求示例

```bash
curl --location --request POST 'http://localhost:3000/api/v1/chat/completions' \
--header 'Authorization: Bearer test-xxxxx' \
--header 'Content-Type: application/json' \
--data-raw '{
    "stream": false,
    "chatId": "test",
    "variables": {
        "query":"你好" # 我的插件输入有一个参数，变量名叫 query
    }
}'
```

### 响应示例

{{< tabs tabTotal="3" >}}

{{< tab tabName="detail=true,stream=false 响应" >}}
{{< markdownify >}}

* 插件的输出可以通过查找`responseData`中, `moduleType=pluginOutput`的元素，其`pluginOutput`是插件的输出。
* 流输出，仍可以通过`choices`进行获取。

```json
{
    "responseData": [
        {
            "nodeId": "fdDgXQ6SYn8v",
            "moduleName": "AI 对话",
            "moduleType": "chatNode",
            "totalPoints": 0.685,
            "model": "FastAI-3.5",
            "tokens": 685,
            "query": "你好",
            "maxToken": 2000,
            "historyPreview": [
                {
                    "obj": "Human",
                    "value": "你好"
                },
                {
                    "obj": "AI",
                    "value": "你好！有什么可以帮助你的吗？欢迎向我提问。"
                }
            ],
            "contextTotalLen": 14,
            "runningTime": 1.73
        },
        {
            "nodeId": "pluginOutput",
            "moduleName": "插件输出",
            "moduleType": "pluginOutput",
            "totalPoints": 0,
            "pluginOutput": {
                "result": "你好！有什么可以帮助你的吗？欢迎向我提问。"
            },
            "runningTime": 0
        }
    ],
    "newVariables": {
        "query": "你好"
    },
    "id": "safsafsa",
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
                "content": "你好！有什么可以帮助你的吗？欢迎向我提问。"
            },
            "finish_reason": "stop",
            "index": 0
        }
    ]
}
```

{{< /markdownify >}}
{{< /tab >}}


{{< tab tabName="detail=true,stream=true 响应" >}}
{{< markdownify >}}

* 插件的输出可以通过获取`event=flowResponses`中的字符串，并将其反序列化后得到一个数组。同样的，查找 `moduleType=pluginOutput`的元素，其`pluginOutput`是插件的输出。
* 流输出，仍和对话接口一样获取。

```bash
event: flowNodeStatus
data: {"status":"running","name":"AI 对话"}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"你"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"好"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"！"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"有"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"什"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"么"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"可以"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"帮"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"助"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"你"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"的"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"吗"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":"？"},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}

event: answer
data: {"id":"","object":"","created":0,"model":"","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}

event: answer
data: [DONE]

event: flowResponses
data: [{"nodeId":"fdDgXQ6SYn8v","moduleName":"AI 对话","moduleType":"chatNode","totalPoints":0.033,"model":"FastAI-3.5","tokens":33,"query":"你好","maxToken":2000,"historyPreview":[{"obj":"Human","value":"你好"},{"obj":"AI","value":"你好！有什么可以帮助你的吗？"}],"contextTotalLen":2,"runningTime":1.42},{"nodeId":"pluginOutput","moduleName":"插件输出","moduleType":"pluginOutput","totalPoints":0,"pluginOutput":{"result":"你好！有什么可以帮助你的吗？"},"runningTime":0}]
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="输出获取" >}}
{{< markdownify >}}

event取值：

- answer: 返回给客户端的文本（最终会算作回答）
- fastAnswer: 指定回复返回给客户端的文本（最终会算作回答）
- toolCall: 执行工具
- toolParams: 工具参数
- toolResponse: 工具返回
- flowNodeStatus: 运行到的节点状态
- flowResponses: 节点完整响应
- updateVariables: 更新变量
- error: 报错

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

## 使用案例

- [接入 NextWeb/ChatGPT web 等应用](/docs/course/openapi)
- [接入 onwechat](/docs/use-cases/onwechat)
- [接入 飞书](/docs/course/feishu)