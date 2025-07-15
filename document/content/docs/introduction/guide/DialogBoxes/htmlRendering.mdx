---
title: "对话框与HTML渲染"
description: "如何在FastGPT中通过Markdown嵌入HTML代码块，并提供全屏、源代码切换等交互功能"
icon: "group"
draft: false
toc: true
weight: 470
---

| 源码模式 | 预览模式 | 全屏模式 |
| --- | --- | --- |
| ![](/imgs/htmlRendering1.png) | ![](/imgs/htmlRendering2.png) | ![](/imgs/htmlRendering3.png) |


### 1. **设计背景**

  尽管Markdown本身支持嵌入HTML标签，但由于安全问题，许多平台和环境对HTML的渲染进行了限制，特别是在渲染动态内容、交互式元素以及外部资源时。这些限制大大降低了用户在撰写和展示复杂文档时的灵活性，尤其是当需要嵌入外部HTML内容时。为了应对这一问题，我们通过使用 `iframe` 来嵌入和渲染HTML内容，并结合 `sandbox` 属性，保障了外部HTML的安全渲染。

### 2. 功能简介

  该功能模块的主要目的是扩展FastGPT在Markdown渲染中的能力，支持嵌入和渲染HTML内容。由于是利用 Iframe 渲染，所以无法确认内容的高度，FastGPT 中会给 Iframe 设置一个固定高度来进行渲染。并且不支持 HTML 中执行 js 脚本。

### 3. 技术实现

  本模块通过以下方式实现了HTML渲染和互动功能：

  - **组件设计**：该模块通过渲染 `iframe` 类型的代码块展示HTML内容。使用自定义的 `IframeBlock` 组件，结合 `sandbox` 属性来保障嵌入内容的安全性。`sandbox` 限制了外部HTML中的行为，如禁用脚本执行、限制表单提交等，确保HTML内容的安全性。通过辅助函数与渲染Markdown内容的部分结合，处理 `iframe` 嵌入的HTML内容。
  - **安全机制**：通过 `iframe` 的 `sandbox` 属性和 `referrerPolicy` 来防止潜在的安全风险。`sandbox` 属性提供了细粒度的控制，允许特定的功能（如脚本、表单、弹出窗口等）在受限的环境中执行，以确保渲染的HTML内容不会对系统造成威胁。
  - **展示与互动功能**：用户可以通过不同的展示模式（如全屏、预览、源代码模式）自由切换，以便更灵活地查看和控制嵌入的HTML内容。嵌入的 `iframe` 自适应父容器的宽度，同时保证 `iframe`嵌入的内容能够适当显示。

### 4. 如何使用

你只需要通过 Markdown 代码块格式，并标记语言为 `html` 即可。例如：

```md
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>欢迎使用FastGPT</title>
  </head>
  <body>
    <nav>
      <ul>
        <li><a href="#home">首页</a></li>
        <li><a href="#about">关于我们</a></li>
        <li><a href="#contact">联系我们</a></li>
        <li><a href="#gallery">图库</a></li>
      </ul>
    </nav>
  </body>
</html>

```