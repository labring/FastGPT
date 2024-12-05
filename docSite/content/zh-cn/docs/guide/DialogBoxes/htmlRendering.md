---
title: "对话框与HTML渲染"
description: "如何在FastGPT中通过Markdown嵌入HTML代码块，并提供全屏、源代码切换等交互功能"
icon: "group"
draft: false
toc: true
weight: 470
---

- ### 1. **设计背景**

  尽管Markdown本身支持嵌入HTML标签，但由于安全问题，许多平台和环境对HTML的渲染进行了限制，特别是在渲染动态内容、交互式元素以及外部资源时。这些限制大大降低了用户在撰写和展示复杂文档时的灵活性，尤其是当需要嵌入外部HTML内容时。为了应对这一问题，我们通过使用 `iframe` 来嵌入和渲染HTML内容，并结合 `sandbox` 属性等现代安全技术，保障了外部HTML的安全渲染，同时提供了全屏预览、源代码切换等互动功能，从而增强了文档的展示效果和用户体验。

  ### 2. 功能简介

  该功能模块的主要目的是扩展FastGPT在Markdown渲染中的能力，支持嵌入和渲染HTML内容，并提供多种交互功能，如全屏模式、预览和源码切换。通过此模块，用户可以在FastGPT中直接嵌入并预览HTML内容，提升文档的展示灵活性和用户交互体验。此功能不仅能够解析并渲染HTML代码，还通过 `iframe` 加载外部HTML内容，确保在安全的环境下渲染这些内容，并允许用户在预览模式和源代码模式之间自由切换。无论是展示简单的HTML片段，还是包含交互式内容的页面，用户都可以通过此模块灵活地实现渲染和交互。

  ### 3. 技术实现

  本模块通过以下方式实现了HTML渲染和互动功能：

  - **组件设计**：该模块通过渲染 `iframe` 类型的代码块展示HTML内容。使用自定义的 `IframeBlock` 组件，结合 `sandbox` 属性来保障嵌入内容的安全性。`sandbox` 限制了外部HTML中的行为，如禁用脚本执行、限制表单提交等，确保HTML内容的安全性。通过辅助函数与渲染Markdown内容的部分结合，处理 `iframe` 嵌入的HTML内容。
  - **安全机制**：通过 `iframe` 的 `sandbox` 属性和 `referrerPolicy` 来防止潜在的安全风险。`sandbox` 属性提供了细粒度的控制，允许特定的功能（如脚本、表单、弹出窗口等）在受限的环境中执行，以确保渲染的HTML内容不会对系统造成威胁。
  - **展示与互动功能**：用户可以通过不同的展示模式（如全屏、预览、源代码模式）自由切换，以便更灵活地查看和控制嵌入的HTML内容。嵌入的 `iframe` 自适应父容器的宽度，同时保证 `iframe`嵌入的内容能够适当显示。

  ### 4. 主要功能

  #### 4.1 渲染HTML代码块

  该功能使得用户能够展示网页内容，从而增强Markdown文档的可视化效果。为了保证安全性，嵌入内容的 `iframe` 使用了 `sandbox` 属性，限制了潜在的恶意行为。例如，用户可以在文档中嵌入如下HTML代码：

  ```Bash
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>欢迎使用FastGPT</title>
    <style>
      ...(这里做省略)
    </style>
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
  
    <div class="container">
      <section class="hero fade-in">
        <h1>欢迎使用FastGPT</h1>
        <p>我们为您提供最前沿的AI技术，助您更高效地解决问题。</p>
      </section>
  
      <section id="gallery" class="image-gallery fade-in">
        <img src="https://via.placeholder.com/400" alt="图片1">
        <img src="https://via.placeholder.com/400" alt="图片2">
        <img src="https://via.placeholder.com/400" alt="图片3">
      </section>
  
      <section id="contact" class="contact-form fade-in">
        <h2>联系我们</h2>
        <form>
          <label for="name">姓名</label>
          <input type="text" id="name" name="name" required placeholder="请输入您的姓名">
  
          <label for="email">电子邮件</label>
          <input type="email" id="email" name="email" required placeholder="请输入您的电子邮件">
  
          <label for="message">留言</label>
          <textarea id="message" name="message" rows="4" required placeholder="请输入您的留言"></textarea>
  
          <button type="submit">提交</button>
        </form>
      </section>
    </div>
  
    <!-- 页脚 -->
    <footer style="text-align: center; padding: 20px 0; background-color: #2c3e50; color: white;">
      <p>&copy; 2024 FastGPT. 保留所有权利。</p>
    </footer>
  </body>
  </html>
  ```

  该功能支持在Markdown中灵活展示HTML片段，增强了内容的可视化和互动性。

  #### 4.2 全屏与源代码切换

  - **源码****模式**：点击切换按钮后，HTML的源代码将显示在界面中，而不是渲染后的预览效果。

  ![](/imgs/htmlRendering1.png)


  - **预览模式**：点击预览按钮后，HTML渲染后的内容将在窗口展示。

  ![](/imgs/htmlRendering2.png)


  - **全屏模式**：点击全屏按钮后，HTML内容将在弹出窗口中以全屏模式展示。用户可以通过右上角的退出按钮返回原始界面。

  ![](/imgs/htmlRendering3.png)

  ### 5. 总结

  该模块通过在Markdown中渲染HTML内容，增强了FastGPT的灵活性和互动性。通过iframe，用户可以将外部HTML内容嵌入文档并进行渲染。该功能支持安全的内容展示，用户能够查看嵌入的网页内容，提升了Markdown文档的可视化效果。目前实现的功能包括通过 `iframe` 渲染外部HTML页面，并提供全屏展示等功能。
