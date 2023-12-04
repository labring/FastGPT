---
title: "AI 对话"
description: "FastGPT AI 对话模块介绍"
icon: "chat"
draft: false
toc: true
weight: 351
---

## 特点

- 可重复添加（复杂编排时防止线太乱，可以更美观）
- 有外部输入
- 有静态配置
- 触发执行
- 核心模块

![](/imgs/aichat.png)

## 参数说明

### 对话模型

可以通过 [config.json](/docs/development/configuration/) 配置可选的对话模型，通过 [one-api](/docs/development/one-api/) 来实现多模型接入。

### 温度 & 回复上限

+ **温度**：越低回答越严谨，少废话（实测下来，感觉差别不大）
+ **回复上限**：最大回复 token 数量（只有 OpenAI 模型有效）。注意，是回复！不是总 tokens。

### 系统提示词（可被外部输入覆盖）

被放置在上下文数组的最前面，role 为 system，用于引导模型。具体用法参考各搜索引擎的教程~

### 限定词（可被外部输入覆盖）

与系统提示词类似，role 也是 system 类型，只不过位置会被放置在问题前，拥有更强的引导作用。

### 引用内容

接收一个外部输入的数组，主要是由【知识库搜索】模块生成，也可以由 HTTP 模块从外部引入。数据结构示例如下：

```ts
type DataType = {
  dataset_id?: string;
  id?: string;
  q: string;
  a: string;
  source?: string;
};
// 如果是外部引入的内容，尽量不要携带 dataset_id 和 id
const quoteList: DataType[] = [
  { dataset_id: '11', id: '222', q: '你还', a: '哈哈', source: '' },
  { dataset_id: '11', id: '333', q: '你还', a: '哈哈', source: '' },
  { dataset_id: '11', id: '444', q: '你还', a: '哈哈', source: '' }
];
```

## 完整上下文组成

最终发送给 LLM 大模型的数据是一个数组，内容和顺序如下：

```bash
[
    系统提示词
    引用内容
    聊天记录
    限定词
    问题
]
```