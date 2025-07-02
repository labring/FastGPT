---
title: "系统插件设计"
description: "FastGPT 系统插件设计方案"
icon: "extension"
draft: false
toc: true
weight: 301
---

## 背景

原先 FastGPT 的各项功能均采用单体应用，子 packages 的方式进行构建。随着用户范围增多，个性化需求丰富，以及多次交付时遇到的系统工具定制困难问题，导致我们对
我们决定设计一种更为灵活的扩展

主要有如下的目的：
1. 解耦合，模块化。
2. FastGPT-plugin 可以快速迭代，版本不依赖于 FastGPT
3. 降低开发复杂度（不需要运行 FastGPT 环境）
4. 插件市场

更远期的设想：
1. 以纯代码的形式构建应用
2. 加入其他可以自定义的模块
