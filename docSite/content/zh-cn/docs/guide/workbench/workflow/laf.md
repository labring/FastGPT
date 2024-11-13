---
title: "Laf 函数调用"
description: "FastGPT Laf 函数调用模块介绍"
icon: "code"
draft: false
toc: true
weight: 266
---


![](/imgs/laf1.webp)

## 介绍

`Laf 函数调用`模块可以调用 Laf 账号下的云函数，其工作原理与 HTTP 模块相同，有以下特殊特征：

- 只能使用 POST 请求
- 请求自带系统参数 systemParams，无需通过变量传递。

## 绑定 Laf 账号

要调用 Laf 云函数，首先需要绑定 Laf 账号和应用，并且在应用中创建云函数。

Laf 提供了 PAT(访问凭证) 来实现 Laf 平台外的快捷登录，可以访问 [Laf 文档](https://doc.Laf.run/zh/cli/#%E7%99%BB%E5%BD%95)查看详细如何获取 PAT。

在获取到 PAT 后，我们可以进入 FastGPT 的`账号页`或是在高级编排中的 `Laf模块` 对 Laf 账号进行绑定。Laf 账号是团队共享的，仅团队管理员可配置。

填入 PAT 验证后，选择需要绑定的应用（应用需要是 Running 状态），即可调用该应用下的云函数。

![](/imgs/laf2.webp)

## 编写云函数

Laf 云函数拥有根据 interface 自动生成 OpenAPI 的能力，可以参照下面的代码编写云函数，以便自动生成 OpenAPI 文档。

`Laf模块`可以根据 OpenAPI 文档，自动识别出入参，无需手动添加数据类型。如果不会写 TS，可忽略，手动在 FastGPT 中添加参数即可。

```ts
import cloud from '@lafjs/cloud'

interface IRequestBody { // 自定义入参，FastGPT 传入的均为POST请求。
  data1: string    // 必填参数
  data2?: string    // 可选参数
}

interface RequestProps extends IRequestBody { // 完整入参，这个无需改动。
  systemParams: { // 这是FastGPT默认会传递过来的参数
    appId: string,
    variables: string,
    histories: string,
    cTime: string,
    chatId: string,
    responseChatItemId: string
  }
}

interface IResponse { // 响应内容
  message: string // 必返回的参数
  msg?: string; // 可选的返回参数
}

export default async function (ctx: FunctionContext): Promise<IResponse> {  
  const {
    data1,
    data2,
    systemParams
  }: RequestProps = ctx.body;
  
  console.log({
    data1,
    data2,
    systemParams
  });

  return { 
    message: 'ok',
    msg: 'msg'
  };
}
```

当然，你也可以在 Laf 平台上选择 fastgpt_template，快速生成该函数模板。

具体操作可以是，进入 Laf 的函数页面，新建函数（注意 fastgpt 只会调用 post 请求的函数），然后复制上面的代码或者点击更多模板搜索“fastgpt”，使用下面的模板

![](/imgs/laf3.webp)

## FastGPT 中使用

在选择函数后，可以通过点击“同步参数”，自动同步云函数的参数到 FastGPT 中。当然也可以手动添加，手动修改后的参数不会被“同步参数”修改。

![](/imgs/laf4.png)

## 使用注意事项

### 调用报错

先在 laf 中调试函数，看是否正常调用。可以通过 console.log，打印入参，将入参放在 Laf 测试页面的 Body 中进行测试。