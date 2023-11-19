---
title: '分享链接鉴权'
description: 'FastGPT 分享链接鉴权'
icon: 'share'
draft: false
toc: true
weight: 564
---

## 使用说明

分享链接鉴权设计的目的在于，将 FastGPT 的对话框安全的接入你现有的系统中。

免登录链接配置中，增加了`凭证校验服务器`后，使用分享链接时会向服务器发起请求，校验链接是否可用，并在每次对话结束后，向服务器发送对话结果。下面以`host`来表示`凭证校验服务器`。服务器接口仅需返回是否校验成功即可，不需要返回其他数据，格式如下：

```json
{
    "success": true,
    "message": "错误提示",
    "msg": "同message, 错误提示"
}
```

![](/imgs/sharelinkProcess.png)

## 配置校验地址和校验token

### 1. 配置校验地址的`BaseURL`、

![](/imgs/share-setlink.jpg)

配置校验地址后，在每次分享链接使用时，都会向对应的地址发起校验和上报请求。

### 2. 分享链接中增加额外 query

在分享链接的地址中，增加一个额外的参数: authToken。例如：

原始的链接：https://fastgpt.run/chat/share?shareId=648aaf5ae121349a16d62192  
完整链接: https://fastgpt.run/chat/share?shareId=648aaf5ae121349a16d62192&authToken=userid12345

这个`token`通常是你系统生成的，在发出校验请求时，FastGPT 会在`body`中携带 token={{authToken}} 的参数。

## 聊天初始化校验

**FastGPT 发出的请求**

```bash
curl --location --request POST '{{host}}/shareAuth/init' \
--header 'Content-Type: application/json' \
--data-raw '{
    "token": "sintdolore"
}'
```

**响应示例**

```json
{
    "success": false,
    "message": "分享链接无效",
}
```

## 对话前校验

**FastGPT 发出的请求**

```bash
curl --location --request POST '{{host}}/shareAuth/start' \
--header 'Content-Type: application/json' \
--data-raw '{
    "token": "sintdolore",
    "question": "用户问题",
}'
```

**响应示例**

```json
{
    "success": true
}
```

## 对话结果上报

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
    ]
}'
```

响应值与 chat 接口相同，增加了一个 token。可以重点关注`responseData`里的值，price 与实际价格的倍率为`100000`。

**此接口无需响应值**

## 使用示例

我们以[Laf作为服务器为例](https://laf.dev/)，展示这 3 个接口的使用方式。

### 1. 创建3个Laf接口

![](/imgs/share-auth1.jpg)

{{< tabs tabTotal="3" >}}
{{< tab tabName="/shareAuth/init" >}}
{{< markdownify >}}

这个接口中，我们设置了`token`必须等于`fastgpt`才能通过校验。（实际生产中不建议固定写死）

```ts
import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const { token } = ctx.body

  if (token === 'fastgpt') {
    return { success: true }
  }

  return { success: false,message: "身份错误" }
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="/shareAuth/start" >}}
{{< markdownify >}}

这个接口中，我们设置了`token`必须等于`fastgpt`才能通过校验。并且如果问题中包含了`你`字，则会报错，用于模拟敏感校验。

```ts
import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const { token, question } = ctx.body
  console.log(token, question, 'start')

  if (token !== 'fastgpt') {
    return { success: false, message: "身份错误" }
 
  }

  if(question.includes("你")){
    return { success: false, message: "内容不合规" }
  }

  return { success: true } 
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="/shareAuth/finish" >}}
{{< markdownify >}}

结果上报接口可自行进行逻辑处理。

```ts
import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const { token, responseData } = ctx.body
  console.log(token,responseData,'=====')
  return { }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


### 2. 配置校验地址

我们随便复制3个地址中一个接口：https://d8dns0.laf.dev/shareAuth/finish , 去除 /shareAuth/finish 后填入 FastGPT 中: https://d8dns0.laf.dev

![](/imgs/share-auth2.jpg)

### 3. 修改分享链接参数

源分享链接：[https://fastgpt.run/chat/share?shareId=64be36376a438af0311e599c](https://fastgpt.run/chat/share?shareId=64be36376a438af0311e599c)

修改后：[https://fastgpt.run/chat/share?shareId=64be36376a438af0311e599c&authToken=fastgpt](https://fastgpt.run/chat/share?shareId=64be36376a438af0311e599c&authToken=fastgpt)

### 4. 测试效果

1. 打开源链接或者`authToken`不等于 `fastgpt`的链接会提示身份错误。
2. 发送内容中包含你字，会提示内容不合规。