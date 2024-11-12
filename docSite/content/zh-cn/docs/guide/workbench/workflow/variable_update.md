---
title: "变量更新"
description: "FastGPT 变量更新模块介绍"
icon: "variable_update"
draft: false
toc: true
weight: 256
---

## 特点 

- 可重复添加
- 有外部输入
- 触发执行
- 手动配置

![](/imgs/variable_update1.png)

## 功能 

- 更新指定节点的输出值

![](/imgs/variable_update2.png)

![](/imgs/variable_update3.png)

- 更新全局变量

![](/imgs/variable_update4.png)

![](/imgs/variable_update5.png)

## 作用

最基础的使用场景为

- 给一个「自定义变量」类型的全局变量赋值，从而实现全局变量无需用户输入
- 更新「变量更新」节点前的工作流节点输出，在后续使用中，使用的节点输出值为新的输出