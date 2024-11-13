---
title: "问题分类"
description: "FastGPT 问题分类模块介绍"
icon: "quiz"
draft: false
toc: true
weight: 238
---

## 特点

- 可重复添加
- 有外部输入
- 需要手动配置
- 触发执行
- function_call 模块

![](/imgs/cq1.png)

## 功能

可以将用户的问题进行分类，分类后执行不同操作。在一些较模糊的场景中，分类效果不是很明显。

## 参数说明

### 系统提示词

被放置在对话最前面，可用于补充说明分类内容的定义。例如问题会被分为：

1. 打招呼
2. Laf 常见问题
3. 其他问题

由于 Laf 不是一个明确的东西，需要给它一个定义，此时提示词里可以填入 Laf 的定义：

```
Laf 是云开发平台，可以快速的开发应用
Laf 是一个开源的 BaaS 开发平台（Backend as a Service)
Laf 是一个开箱即用的 serverless 开发平台
Laf 是一个集「函数计算」、「数据库」、「对象存储」等于一身的一站式开发平台
Laf 可以是开源版的腾讯云开发、开源版的 Google Firebase、开源版的 UniCloud
```

### 聊天记录

适当增加一些聊天记录，可以联系上下文进行分类。

### 用户问题

用户输入的内容。

### 分类内容

依然以这 3 个分类为例，可以看到最终组成的 Function。其中返回值由系统随机生成，不需要关心。

1. 打招呼
2. Laf 常见问题
3. 其他问题

```js
const agentFunction = {
    name: agentFunName,
    description: '判断用户问题的类型属于哪方面，返回对应的枚举字段',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: `打招呼，返回: abc；Laf 常见问题，返回：vvv；其他问题，返回：aaa`
          enum: ["abc","vvv","aaa"]
        }
      },
      required: ['type']
    }
};
```

上面的 Function 必然会返回 `type = abc，vvv，aaa` 其中一个值，从而实现分类判断。