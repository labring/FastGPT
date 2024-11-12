---
title: "如何提交应用模板"
description: "指南：如何向 FastGPT 提交应用模板"
icon: "template_submission"
draft: false
toc: true
weight: 602
---


## 什么模板可以合并

目前合并进仓库的应用模板，会在「模板市场」中全部展示给用户。

为了控制模板的质量以及避免数量过多带来的繁琐，并不是所有的模板都会被合并到开源仓库中，你可以提前 PR 与我们沟通模板的内容。

预估最后总体的数量不会很多，控制在 50 个左右，一半来自 FastGPT Team，一半来自社区用户。

## 如何写一个应用模板

1. ### 跑通 FastGPT dev 环境

需要在 dev 环境下执行下面的操作。

> 可参照 [FastGPT｜快速开始本地开发](https://doc.fastgpt.in/docs/development/intro/)

1. ### 在 FastGPT 工作台中，创建一个应用

创建空白工作流即可。

![](/imgs/template_submission1.png)

1. ### 创建应用模板

应用模板配置以及相关资源，都会在 **projects/app/public/appMarketTemplates** 目录下。

![](/imgs/template_submission2.png)

1. 在 **projects/app/public/appMarketTemplates** 目录下，创建一个文件夹，名称为模板对应的 id。
2. 在刚刚创建的文件夹中，再创建一个 **template.json** 文件，复制粘贴并填写如下配置：

```JSON
{
  "name": "模板名",
  "intro": "模板描述，会展示在模板市场的展示页",
  "author": "填写你的名字",
  "avatar": "模板头像，可以将图片文件放在同一个文件夹中，然后填写相应路径",
  
  "tags": ["模板标签"], // writing(文本创作)，image-generation(图片生成)，web-search(联网搜索),
              // roleplay(角色扮演), office-services(办公服务) 暂时分为 5 类，从中选择相应的标签
  
  "type": "模板类别",  // simple(简易应用), advanced(工作流), plugin(插件)

  "workflow": {  // 这个对象先不管，待会直接粘贴导出的工作流即可
    "nodes": [],
    "edges": [],
    "chatConfig": {}
  }
}
```

1. ### 完成应用编排并测试

完成应用编排后，可以点击右上角的发布。

1. ### 复制配置到 template.json

鼠标放置在左上角应用的头像和名称上，会出现对于下拉框操作，可以导出工作流配置。

导出的配置，会自动复制到剪切板，可以直接到 template.json 文件中粘贴使用，替换步骤 2 中，**workflow** 的值。

![](/imgs/template_submission3.png)

1. ### 验证模板是否加载成功

刷新页面，打开模板市场，看其是否成功加载，并点击「使用」测试其功能。

![](/imgs/template_submission4.png)

1. ### 提交 PR

如果你觉得你的模板需要提交到开源仓库，可以通过 PR 形式向我们提交。

- 写清楚模板的介绍和功能
- 配上模板运行的效果图
- 模板参数填写说明，需要在 PR 中写清楚。例如，有些模板需要去某个提供商申请 key，需要附上对应的地址和教程，后续我们会加入到文档中。