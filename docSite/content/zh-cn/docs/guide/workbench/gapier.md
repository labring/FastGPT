---
title: "使用 Gapier 快速导入Agent工具"
description: "FastGPT 使用 Gapier 快速导入Agent工具"
icon: "build"
draft: false
toc: true
weight: 300
---

FastGPT V4.7版本加入了工具调用，可以兼容 GPTs 的 Actions。这意味着，你可以直接导入兼容 GPTs 的 Agent 工具。

Gapier 是一个在线 GPTs Actions工具，提供了50多种现成工具，并且每天有免费额度进行测试，方便用户试用，官方地址为：[https://gapier.com/](https://gapier.com/)。

![](/imgs/gapierToolResult1.webp)

现在，我们开始把 Gapier 的工具导入到 FastGPT 中。

## 1. 创建插件

| Step1 | Step2 | Step3 |
| --- | --- | --- |
| ![](/imgs/gapierTool1.png) | ![](/imgs/gapierTool2.png) | 登录[Gapier](https://gapier.com/) 复制相关参数 <br> ![](/imgs/gapierTool3.png) |
| Step4 | Step5 | Step6 |
| 自定义请求头: Authorization<br>请求值: Bearer 复制的key <br> ![](/imgs/gapierTool4.png) | ![](/imgs/gapierTool5.png) | ![](/imgs/gapierTool6.png) |

创建完后，如果需要变更，无需重新创建，只需要修改对应参数即可，会自动做差值比较更新。

![](/imgs/gapierTool7.png)

## 2. 应用绑定工具

### 简易模式

| Step1 | Step2 |
| --- | --- | --- |
| ![](/imgs/gapierTool8.png) | ![](/imgs/gapierTool9.webp) |
| Step3 | Step4 |
| ![](/imgs/gapierTool10.webp) | ![](/imgs/gapierTool11.png) |

### 高级编排

| Step1 | Step2 |
| --- | --- | --- |
| ![](/imgs/gapierTool12.webp) | ![](/imgs/gapierTool13.webp) |
| Step3 | Step4 |
| ![](/imgs/gapierTool14.webp) | ![](/imgs/gapierTool15.webp) |

![](/imgs/gapierTool16.webp)

## 3. 工具调用说明

### 不同模型的区别

不同模型调用工具采用不同的方法，有些模型支持 toolChoice 和 functionCall 效果会更好。不支持这两种方式的模型通过提示词调用，但是效果不是很好，并且为了保证顺利调用，FastGPT内置的提示词，仅支持每次调用一个工具。

具体哪些模型支持 functionCall 可以官网查看（当然，也需要OneAPI支持），同时需要调整模型配置文件中的对应字段（详细看配置字段说明）。

线上版用户，可以在模型选择时，看到是否支持函数调用的标识。

![](/imgs/gapierTool17.webp)
