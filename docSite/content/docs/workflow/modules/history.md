---
title: "历史记录"
description: "FastGPT 历史记录模块介绍"
icon: "history"
draft: false
toc: true
weight: 128
---

# 特点

- 可重复添加（防止复杂编排时线太乱，重复添加可以更美观）
- 无外部输入
- 流程入口
- 自动执行

每次对话时，会从数据库取最多 n 条聊天记录作为上下文。注意，不是指本轮对话最多 n 条上下文，本轮对话还包括：提示词、限定词、引用内容和问题。

![](/imgs/history.png)