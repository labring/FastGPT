---
title: '知识库搜索'
description: 'FastGPT AI 知识库搜索模块介绍'
icon: 'chat'
draft: false
toc: true
weight: 234
---

知识库搜索具体参数说明，以及内部逻辑请移步：[FastGPT知识库搜索方案](/docs/course/data_search/)

## 特点

- 可重复添加（复杂编排时防止线太乱，可以更美观）
- 有外部输入
- 有静态配置
- 触发执行
- 核心模块

![](/imgs/flow-dataset1.png)

## 参数说明

### 输入 - 关联的知识库

可以选择一个或多个**相同向量模型**的知识库，用于向量搜索。

### 输入 - 搜索参数

[点击查看参数介绍](/docs/course/data_search/#搜索参数)

### 输出 - 引用内容

以数组格式输出引用，长度可以为 0。意味着，即使没有搜索到内容，这个输出链路也会走通。
