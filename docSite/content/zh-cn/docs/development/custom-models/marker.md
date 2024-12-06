---
title: '接入 Marker  PDF 文档解析'
description: '使用 Marker 解析 PDF 文档，可实现图片提取和布局识别'
icon: 'api'
draft: false
toc: true
weight: 909
---

## 背景

PDF 是一个相对复杂的文件格式，在 FastGPT 内置的 pdf 解析器中，依赖的是 pdfjs 库解析，该库基于逻辑解析，无法有效的理解复杂的 pdf 文件。所以我们在解析 pdf 时候，如果遇到图片、表格、公式等非简单文本内容，会发现解析效果不佳。

市面上目前有多种解析 PDF 的方法，比如使用 [Marker](https://github.com/VikParuchuri/marker)，该项目使用了 Surya 模型，基于视觉解析，可以有效提取图片、表格、公式等复杂内容。为了可以让 Marker 快速接入 FastGPT，我们做了一个自定义解析的拓展 Demo。

在 FastGPT 4.8.15 版本中，你可以通过增加一个环境变量，来替换掉 FastGPT 系统内置解析器，实现自定义的文档解析服务。该功能只是 Demo 阶段，后期配置模式和交互规则会发生改动。

## 使用教程

### 1. 按照 Marker

参考文档 [Marker 安装教程](https://github.com/labring/FastGPT/tree/main/python/pdf-marker)，安装 Marker 模型。封装的 API 已经适配了 FastGPT 自定义解析服务。

这里介绍快速 Docker 安装的方法：

```dockerfile
docker pull crpi-h3snc261q1dosroc.cn-hangzhou.personal.cr.aliyuncs.com/marker11/marker_images:latest
docker run --gpus all -itd -p 7231:7231 --name model_pdf_v1 crpi-h3snc261q1dosroc.cn-hangzhou.personal.cr.aliyuncs.com/marker11/marker_images:latest
```

### 2. 添加 FastGPT 环境变量

```
CUSTOM_READ_FILE_URL=http://xxxx.com/v1/parse/file
CUSTOM_READ_FILE_EXTENSION=pdf
```

* CUSTOM_READ_FILE_URL - 自定义解析服务的地址, host改成解析服务的访问地址，path 不能变动。
* CUSTOM_READ_FILE_EXTENSION - 支持的文件后缀，多个文件类型，可用逗号隔开。

### 3. 测试效果

通过知识库上传一个 pdf 文件，并确认上传，可以在日志中看到 LOG （LOG_LEVEL需要设置 info 或者 debug）：

```
[Info] 2024-12-05 15:04:42 Parsing files from an external service 
[Info] 2024-12-05 15:07:08 Custom file parsing is complete, time: 1316ms 
```

然后你就可以发现，通过 Marker 解析出来的 pdf 会携带图片链接：

![alt text](/imgs/image-10.png)


## 效果展示

以清华的 [ChatDev Communicative Agents for Software Develop.pdf](https://arxiv.org/abs/2307.07924) 为例，展示 Marker 解析的效果：

|  |  |  |
| --- | --- | --- |
| ![alt text](/imgs/image-11.png) | ![alt text](/imgs/image-12.png) | ![alt text](/imgs/image-13.png)  |
| ![alt text](/imgs/image-14.png) | ![alt text](/imgs/image-15.png) | ![alt text](/imgs/image-16.png) |

上图是分块后的结果，下图是 pdf 原文。整体图片、公式、表格都可以提取出来，效果还是杠杠的。

不过要注意的是，[Marker](https://github.com/VikParuchuri/marker) 的协议是`GPL-3.0 license`，请在遵守协议的前提下使用。