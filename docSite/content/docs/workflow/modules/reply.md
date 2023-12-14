---
title: "指定回复"
description: "FastGPT 指定回复模块介绍"
icon: "reply"
draft: false
toc: true
weight: 359
---

## 特点

- 可重复添加（防止复杂编排时线太乱，重复添加可以更美观）
- 可手动输入
- 可外部输入
- 会输出结果给客户端

制定回复模块通常用户特殊状态回复，当然你也可以像图 2 一样，实现一些比较骚的操作~ 触发逻辑非常简单：

1. 一种是写好回复内容，通过触发器触发。
2. 一种是不写回复内容，直接由外部输入触发，并回复输入的内容。

{{< figure
    src="/imgs/specialreply.png"
    alt=""
    caption="图 1"
    >}}

{{< figure
    src="/imgs/specialreply2.png"
    alt=""
    caption="图 2"
    >}}