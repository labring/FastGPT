---
title: "HTTP 模块"
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

- Params 为路径请求参数，GET请求中用的居多。
- Body 为请求体，POST请求中用的居多。
- Headers 为请求头，用于传递一些特殊的信息。
- 3 种数据中均可以通过 `{{}}` 来引用变量。
- 变量来自于`全局变量`、`系统变量`、`局部传入`

## 参数结构

### 系统变量说明

你可以将鼠标放置在`请求参数`旁边的问号中，里面会提示你可用的变量。

- appId: 应用的ID
- chatId: 当前对话的ID，测试模式下不存在。
- responseChatItemId: 当前对话中，响应的消息ID，测试模式下不存在。
- variables: 当前对话的全局变量。
- cTime: 当前时间。
- histories: 历史记录（默认最多取10条，无法修改长度）

### Params, Headers

不多描述，使用方法和Postman, ApiFox 基本一致，目前 Params 和 Headers 未提供语法提示，后续会加入。

可通过 {{key}} 来引入变量。例如：

| key | value |
| --- | --- |
| appId | {{appId}} |
| Authorization | Bearer {{token}} |

### Body

只有`POST`模式下会生效。

可以写一个`自定义的 Json`，并通过 {{key}} 来引入变量。例如：

{{< tabs tabTotal="3" >}}
{{< tab tabName="假设有一组变量" >}}
{{< markdownify >}}

```json
{
  "string": "字符串",
  "number": 123,
  "boolean": true,
  "array": [1, 2, 3],
  "obj": {
    "name": "FastGPT",
    "url": "https://fastgpt.in"
  }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="Http 模块中的Body声明" >}}
{{< markdownify >}}

注意，在 Body 中，你如果引用`字符串`，则需要加上`""`，例如：`"{{string}}"`。

```json
{
  "string": "{{string}}",
  "token": "Bearer {{string}}",
  "number": {{number}},
  "boolean": {{boolean}},
  "array": [{{number}}, "{{string}}"],
  "array2": {{array}},
  "object": {{obj}}
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="最终得到的解析" >}}
{{< markdownify >}}

```json
{
  "string": "字符串",
  "token": "Bearer 字符串",
  "number": 123,
  "boolean": true,
  "array": [123, "字符串"],
  "array2": [1, 2, 3],
  "object": {
    "name": "FastGPT",
    "url": "https://fastgpt.in"
  }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

### 如何获取返回值

从图中可以看出，FastGPT可以添加多个返回值，这个返回值并不代表接口的返回值，而是代表`如何解析接口返回值`，可以通过 key 来`提取`接口响应的值。例如: 

{{< tabs tabTotal="2" >}}
{{< tab tabName="接口响应格式" >}}
{{< markdownify >}}

```json
{
  "message": "测试",
  "data":{
      "user": {
        "name": "xxx",
        "age": 12
      },
      "list": [
        {
          "name": "xxx",
          "age": 50
        },
        [{ "test": 22 }]
      ],
      "psw": "xxx"
  }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="FastGPT 转化后的格式" >}}
{{< markdownify >}}

```json
{
  "message": "测试",
  "data.user": { "name": "xxx", "age": 12 },
  "data.user.name": "xxx",
  "data.user.age": 12,
  "data.list": [ { "name": "xxx", "age": 50 }, [{ "test": 22 }] ],
  "data.list[0]": { "name": "xxx", "age": 50 },
  "data.list[0].name": "xxx",
  "data.list[0].age": 50,
  "data.list[1]": [ { "test": 22 } ],
  "data.list[1][0]": { "test": 22 },
  "data.list[1][0].test": 22,
  "data.psw": "xxx"
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


你可以配置对应的`key`来从`FastGPT 转化后的格式`获取需要的值，该规则遵守 JS 的对象取值规则。例如：

1. 获取`message`的内容，那么你可以配置`message`的`key`为`message`，这样就可以获取到`message`的内容。
2. 获取`user的name`，则`key`可以为：`data.user.name`。
3. 获取list中第二个元素，则`key`可以为：`data.list[1]`，然后输出类型选择字符串，则获自动获取到`[ { "test": 22 } ]`的`json`字符串。

### 自动格式化输出

FastGPT v4.6.8 后，加入了出参格式化功能，主要以`json`格式化成`字符串`为主。如果你的输出类型选择了`字符串`，则会将`HTTP`对应`key`的值，转成`json`字符串进行输出。因此，未来你可以直接从`HTTP`接口输出内容至`文本加工`中，然后拼接适当的提示词，最终输入给`AI对话`。

### 动态外部数据

在插件中的`HTTP模块`有一个属性叫`动态外部数据`，这个属性是与`插件输入`中，数据类型为`动态外部数据`的值搭配使用。

类似于文本加工模块，会有一个不确定长度，不确定key的用户输入，因此这部分数据会被`动态外部数据`接收，它们是一个对象。在 HTTP 模块中，你可以在`Body`中接收到一个`key`为`DYNAMIC_INPUT_KEY`的对象。

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
  appointment: string;
  action: 'post' | 'delete' | 'put' | 'get'
}

export default async function (ctx: FunctionContext) {
  try {
    // 从 body 中获取参数
    const { appId, appointment, action } = ctx.body as RequestType

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