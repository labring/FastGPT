---
title: "新 HTTP 模块"
description: "FastGPT HTTP 模块介绍"
icon: "http"
draft: false
toc: true
weight: 355
---

## 特点

- 可重复添加
- 有外部输入
- 手动配置
- 触发执行
- 核中核模块

![](/imgs/http1.jpg)

## 介绍

HTTP 模块会向对应的地址发送一个 `POST/GET` 请求，携带部分`系统参数`及`自定义参数`，并接收一个 JSON 响应值，字段也是自定义。

- 你还可以通过 JSON 传入自定义的请求头。
- POST 请求中，数据会被放置在 `body` 中。
- GET 请求中，数据会被放置在 `query` 中。
- 在出入参数中，你都可以通过 xxx.xxx 来代表嵌套的对象。

## 参数结构

### 系统参数说明

- appId: 应用的ID
- chatId: 当前对话的ID，测试模式下不存在。
- responseChatItemId: 当前对话中，响应的消息ID，测试模式下不存在。
- variables: 当前对话的全局变量。
- data: 自定义传递的参数。

### 嵌套对象使用

**入参**

假设我们设计了`3个`输入。

- user.name (string)
- user.age (number)
- type (string)

最终组成的对象为: 

```json
{
  "user": {
    "name": "",
    "age": ""
  },
  "type": ""
}
```

**出参**

假设接口的输出结构为: 

```json
{
  "message": "测试",
  "data":{
    "name": "name",
    "age": 10
  }
}
```

那么，自定出参的`key`可以设置为: 

- message (string)
- data.name (string)
- data.age (number)


## POST 示例

**自定义入参**

- user.name (string)
- user.age (number)
- type (string)

**自定义出参**

- message (string)
- data.name (string)
- data.age (number)

那么，这个模块发出的请求则是:

{{< tabs tabTotal="2" >}}
{{< tab tabName="POST 请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST 'http://xxxx.com' \
--header 'Content-Type: application/json' \
--data-raw '{
  "appId": "65782f7ffae5f7854ed4498b",
  "chatId": "xxxx",
  "responseChatItemId": "xxxx",
  "variables": {
    "cTime": "2023-12-18 13:45:46"
  },
  "data": {
    "user": {
      "name": "",
      "age": ""
    },
    "type": ""
  }
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="POST响应" >}}
{{< markdownify >}}

```json
{
  "message": "message",
  "data": {
    "name": "name",
    "age": 10
  }
}
```
{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

## GET 示例

GET 中，不推荐使用嵌套参数，否则会出现奇怪的问题。此外，GET 请求中，FastGPT 会将参数扁平化，不会将自定义参单独抽到 data 中，同时全局变量也会扁平化，因此需要注意字段 key 是否冲突。

**自定义入参**

- name (string)
- age (number)
- type (string)

**自定义出参**

- message (string)
- name (string)
- age (number)

那么，这个模块发出的请求则是:

{{< tabs tabTotal="2" >}}
{{< tab tabName="GET 请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request GET 'http://xxx.com/test?name&age&type&appId=65782f7ffae5f7854ed4498b&chatId=xxxx&responseChatItemId=xxxx&cTime=2023-12-18 13:45:46'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="GET 响应" >}}
{{< markdownify >}}

```json
{
  "message": "message",
  "data": {
    "name": "name",
    "age": 10
  }
}
```
{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


## laf 对接 HTTP 示例

{{% alert context="warning" %}}
如果你不想额外部署服务，可以使用 [Laf](https://laf.dev/) 来快速开发上线接口，即写即发，无需部署。
{{% /alert %}}

下面是在 Laf 编写的 POST 请求示例：

```ts
import cloud from '@lafjs/cloud'
const db = cloud.database()

type RequestType = {
  appId: string;
  data: {
    appointment: string;
    action: 'post' | 'delete' | 'put' | 'get'
  }
}

export default async function (ctx: FunctionContext) {
  try {
    // 从 body 中获取参数
    const { appId, data: { appointment, action } } = ctx.body as RequestType

    const parseBody = JSON.parse(appointment)
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
      response: "异常"
    }
  } catch (err) {
    return {
      response: "异常"
    }
  }
}
```

## 作用

通过 HTTP 模块你可以无限扩展，比如：
- 操作数据库
- 调用外部数据源
- 执行联网搜索
- 发送邮箱
- ....


## 相关示例

- [谷歌搜索](/docs/workflow/examples/google_search/)
- [实验室预约（操作数据库）](/docs/workflow/examples/lab_appointment/)