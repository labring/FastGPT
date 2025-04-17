---
title: "知识库搜索引用合并"
description: "FastGPT 知识库搜索引用合并模块介绍"
icon: "knowledge_merge"
draft: false
toc: true
weight: 262
---


![](/imgs/knowledge_merge1.png)

## 作用

将多个知识库搜索结果合并成一个结果进行输出，并会通过 RRF 进行重新排序（根据排名情况），并且支持最大 tokens 过滤。

## 使用方法

AI对话只能接收一个知识库引用内容。因此，如果调用了多个知识库，无法直接引用所有知识库（如下图）

![](/imgs/knowledge_merge2.png)

使用**知识库搜索引用合并**，可以把多个知识库的搜索结果合在一起。

![](/imgs/knowledge_merge3.png)

## 可用例子：

1. 经过问题分类后对不同知识库进行检索，然后统一给一个 AI 进行回答，此时可以用到合并，不需要每个分支都添加一个 AI 对话。