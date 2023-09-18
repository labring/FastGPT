---
title: "HTTP 模块"
description: "FastGPT HTTP 模块介绍"
icon: "http"
draft: false
toc: true
weight: 129
---

## 特点

- 可重复添加
- 有外部输入
- 手动配置
- 触发执行
- 核中核模块

![](/imgs/http1.png)

## 介绍

HTTP 模块会向对应的地址发送一个 POST 请求（Body 中携带 JSON 类型的参数，具体的参数可自定义），并接收一个 JSON 响应值，字段也是自定义。如上图中，我们定义了一个入参：「提取的字段」（定义的 key 为 appointment，类型为 string）和一个出参：「提取结果」（定义的 key 为 response，类型为 string）。

那么，这个请求的命令为：

```bash
curl --location --request POST 'https://xxxx.laf.dev/appointment-lab' \
--header 'Content-Type: application/json' \
--data-raw '{
  "appointment":"{\"name\":\"小明\",\"time\":\"2023/08/16 15:00\",\"labname\":\"子良A323\"}"
}'
```

响应为：

```json
{
  "response": "您已经有一个预约记录了，每人仅能同时预约一个实验室:\n  姓名：小明\n  时间: 2023/08/15 15:00\n  实验室: 子良A323\n      "
}
```

{{% alert context="warning" %}}
如果你不想额外部署服务，可以使用 [Laf](https://laf.dev/) 来快速开发上线接口，即写即发，无需部署。

下面是在 Laf 上编写的一个请求示例：
{{% /alert %}}

```ts
import cloud from '@lafjs/cloud';
const db = cloud.database();

export default async function (ctx: FunctionContext) {
  const { appointment } = ctx.body;
  const { name, time, labname } = JSON.parse(appointment);

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
      response: `您已经有一个预约记录了，每人仅能同时预约一个实验室:
  姓名：${record.name}
  时间: ${record.time}
  实验室: ${record.labname}
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

## 作用

基于 HTTP 模块可以无限扩展，比如操作数据库、执行联网搜索、发送邮箱等等。如果你有有趣的案例，欢迎提交 PR 到 [编排案例](/docs/category/examples)