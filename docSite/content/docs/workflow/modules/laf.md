---
title: "Laf 函数调用"
description: "FastGPT Laf 函数调用模块介绍"
icon: "Laf"
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

![](/imgs/laf1.webp)

## 介绍

Laf 函数调用模块可以调用 Laf 账号下的云函数，其操作与 HTTP 模块相同，可以理解为封装了请求 Laf 云函数的 http 模块，值得注意的不同之处为：

- 只能使用 POST 请求
- 请求自带系统参数 systemParams

## 具体使用

要能调用 Laf 云函数，首先需要绑定 Laf 账号和应用，并且在应用中创建云函数。

Laf 提供了 PAT(访问凭证) 来实现 Laf 平台外的快捷登录，可以访问 [Laf 文档](https://doc.Laf.run/zh/cli/#%E7%99%BB%E5%BD%95)查看详细如何获取 PAT。

在获取到 PAT 后，我们可以进入 fastgpt 的账号页或是直接在高级编排中使用 Laf 模块，填入 PAT 验证后，选择需要绑定的应用（应用需要是 Running 状态），即可调用 Laf 云函数。

> 如果需要解绑则取消绑定后，点击“更新”即可

![](/imgs/laf2.webp)

为了更便捷地调用 Laf 云函数，可以参照下面的代码编写云函数，以便 openAPI 识别

```ts
import cloud from '@Lafjs/cloud'

interface IRequestBody {
  username: string    // 用户名
  passwd?: string    // 密码
}

interface IResponse {
  message: string // 返回信息
  data: any       // 返回数据
}

type extendedBody = IRequestBody & {
  systemParams?: {
    appId: string, 
    variables: string,
    histories: string,
    cTime: string,
    chatId: string,
    responseChatItemId: string
  }
}

export default async function (ctx: FunctionContext): Promise<IResponse> {  
  const body: extendedBody = ctx.body;
  
  console.log(body.systemParams.chatId);

  return { 
    message: 'ok',
    data: '查找到用户名为' + body.username + '的用户'
  };
}
```

具体操作可以是，进入 Laf 的函数页面，新建函数（注意 fastgpt 只会调用 post 请求的函数），然后复制上面的代码或者点击更多模板搜索“fastgpt”，使用下面的模板

![](/imgs/laf3.webp)

这样就能直接通过点击“同步参数”，一键填写输入输出

![](/imgs/laf4.webp)

当然也可以手动添加，手动修改后的参数不会被“同步参数”修改

## 作用
Laf 账号是绑定在团队上的，团队的成员可以轻松调用已经编写好的云函数
