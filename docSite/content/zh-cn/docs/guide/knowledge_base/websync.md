---
title: 'Web 站点同步'
description: 'FastGPT Web 站点同步功能介绍和使用方式'
icon: 'language'
draft: false
toc: true
weight: 406
---

![](/imgs/webSync1.jpg)

该功能目前仅向商业版用户开放。

## 什么是 Web 站点同步

Web 站点同步利用爬虫的技术，可以通过一个入口网站，自动捕获`同域名`下的所有网站，目前最多支持`200`个子页面。出于合规与安全角度，FastGPT 仅支持`静态站点`的爬取，主要用于各个文档站点快速构建知识库。

Tips: 国内的媒体站点基本不可用，公众号、csdn、知乎等。可以通过终端发送`curl`请求检测是否为静态站点，例如：

```bash
curl https://doc.tryfastgpt.ai/docs/intro/
```

## 如何使用

### 1. 新建知识库，选择 Web 站点同步

![](/imgs/webSync2.png)

![](/imgs/webSync3.png)

### 2. 点击配置站点信息

![](/imgs/webSync4.png)

### 3. 填写网址和选择器

![](/imgs/webSync5.jpg)

好了， 现在点击开始同步，静等系统自动抓取网站信息即可。


## 创建应用，绑定知识库

![](/imgs/webSync6.webp)

## 选择器如何使用

选择器是 HTML CSS JS 的产物，你可以通过选择器来定位到你需要抓取的具体内容，而不是整个站点。使用方式为：

### 首先打开浏览器调试面板（通常是 F12，或者【右键 - 检查】）

![](/imgs/webSync7.webp)

![](/imgs/webSync8.webp)

### 输入对应元素的选择器

[菜鸟教程 css 选择器](https://www.runoob.com/cssref/css-selectors.html)，具体选择器的使用方式可以参考菜鸟教程。

上图中，我们选中了一个区域，对应的是`div`标签，它有 `data-prismjs-copy`, `data-prismjs-copy-success`, `data-prismjs-copy-error` 三个属性，这里我们用到一个就够。所以选择器是：
**`div[data-prismjs-copy]`**

除了属性选择器，常见的还有类和ID选择器。例如：

![](/imgs/webSync9.webp)

上图 class 里的是类名（可能包含多个类名，都是空格隔开的，选择一个即可），选择器可以为：**`.docs-content`**

### 多选择器使用

在开头的演示中，我们对 FastGPT 文档是使用了多选择器的方式来选择，通过逗号隔开了两个选择器。

![](/imgs/webSync10.webp)

我们希望选中上图两个标签中的内容，此时就需要两组选择器。一组是：`.docs-content .mb-0.d-flex`，含义是 `docs-content` 类下同时包含 `mb-0`和`d-flex` 两个类的子元素；

另一组是`.docs-content div[data-prismjs-copy]`，含义是`docs-content` 类下包含`data-prismjs-copy`属性的`div`元素。

把两组选择器用逗号隔开即可：`.docs-content .mb-0.d-flex, .docs-content div[data-prismjs-copy]`