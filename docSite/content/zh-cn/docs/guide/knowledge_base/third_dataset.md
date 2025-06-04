---
title: '第三方知识库开发'
description: '本节详细介绍如何在FastGPT上自己接入第三方知识库'
icon: 'language'
draft: false
toc: true
weight: 410
---

目前，互联网上拥有各种各样的文档库，例如飞书，语雀等等。 FastGPT 的不同用户可能使用的文档库不同，目前 FastGPT 内置了飞书、语雀文档库，如果需要接入其他文档库，可以参考本节内容。


## 统一的接口规范

为了实现对不同文档库的统一接入，FastGPT 对第三方文档库进行了接口的规范，共包含 4 个接口内容，可以[查看 API 文件库接口](/docs/guide/knowledge_base/api_dataset)。

所有内置的文档库，都是基于标准的 API 文件库进行扩展。可以参考`FastGPT/packages/service/core/dataset/apiDataset/yuqueDataset/api.ts`中的代码，进行其他文档库的扩展。一共需要完成 4 个接口开发：

1. 获取文件列表
2. 获取文件内容/文件链接
3. 获取原文预览地址
4. 获取文件详情信息

## 开始一个第三方文件库

为了方便讲解，这里以添加飞书知识库( FeishuKnowledgeDataset )为例。

### 1. 添加第三方文档库参数

首先，要进入 FastGPT 项目路径下的`FastGPT\packages\global\core\dataset\apiDataset.d.ts`文件，添加第三方文档库 Server 类型。知识库类型的字段由自己设计，主要是自己需要那些内容。例如，语雀知识库中，需要提供`userId`、`token`两个字段作为鉴权信息。

```ts
export type YuqueServer = {
  userId: string;
  token?: string;
  basePath?: string;
};
```

{{% alert icon="🤖 " context="success" %}}
如果文档库有`根目录`选择的功能，需要设置添加一个字段`basePath`[点击查看`根目录`功能](/docs/guide/knowledge_base/third_dataset/#添加配置表单)
{{% /alert %}}

![](/imgs/thirddataset-1.png)

### 2. 创建 Hook 文件

每个第三方文档库都会采用 Hook 的方式来实现一套 API 接口的维护，Hook 里包含 4 个函数需要完成。

- 在`FastGPT\packages\service\core\dataset\apiDataset\`下创建一个文档库的文件夹，然后在文件夹下创建一个`api.ts`文件
- 在`api.ts`文件中，需要完成 4 个函数的定义，分别是：
  - `listFiles`：获取文件列表
  - `getFileContent`：获取文件内容/文件链接
  - `getFileDetail`：获取文件详情信息
  - `getFilePreviewUrl`：获取原文预览地址

### 3. 添加知识库类型

在`FastGPT\packages\global\core\dataset\type.d.ts`文件中，导入自己创建的知识库类型。

![](/imgs/thirddataset-2.png)

### 4. 添加知识库数据获取

在`FastGPT\packages\global\core\dataset\apiDataset\utils.ts`文件中，添加如下内容。

![](/imgs/thirddataset-3.png)

### 5. 添加知识库调用方法

在`FastGPT\packages\service\core\dataset\apiDataset\index.ts`文件下，添加如下内容。

![](/imgs/thirddataset-4.png)

## 添加前端

`FastGPT\packages\web\i18n\zh-CN\dataset.json`,`FastGPT\packages\web\i18n\en\dataset.json`和`FastGPT\packages\web\i18n\zh-Hant\dataset.json`中添加自己的 I18n 翻译，以中文翻译为例，大体需要如下几个内容：

![](/imgs/thirddataset-5.png)

`FastGPT\packages\service\support\operationLog\util.ts`文件下添加如下内容，以支持获取 I18n 翻译。

![](/imgs/thirddataset-6.png)

{{% alert icon="🤖 " context="success" %}}
此次 I18n 翻译内容存放在`FastGPT\packages\web\i18n\zh-Hant\account_team.json`,`FastGPT\packages\web\i18n\zh-CN\account_team.json`和`FastGPT\packages\web\i18n\en\account_team.json`,字段格式为`dataset.XXX_dataset`，以飞书知识库为例，字段值为`dataset.feishu_knowledge_dataset`
{{% /alert %}}

`FastGPT\packages\web\components\common\Icon\icons\core\dataset\`添加自己的知识库图标，一共是两个，分为`Outline`和`Color`，分别是有颜色的和无色的，具体看如下图片。

![](/imgs/thirddataset-7.png)


在`FastGPT\packages\web\components\common\Icon\constants.ts`文件中，添加自己的图标。 `import` 是图标的存放路径。

![](/imgs/thirddataset-8.png)

在`FastGPT\packages\global\core\dataset\constants.ts`中，添加自己的知识库类型,分别要在`DatasetTypeEnum`和`ApiDatasetTypeMap`中添加内容。

| | |
| --- | --- | 
| ![](/imgs/thirddataset-9.png) | ![](/imgs/thirddataset-10.png) |

{{% alert icon="🤖 " context="success" %}}
`courseUrl`字段是相应的文档说明，如果有的话，可以添加。
文档添加在`FastGPT\docSite\content\zh-cn\docs\guide\knowledge_base\`
`label`内容是自己之前通过 i18n 翻译添加的知识库名称的。
`icon`和`avatar`是自己之前添加的两个图标 
{{% /alert %}}

在`FastGPT\projects\app\src\pages\dataset\list\index.tsx`文件下，添加如下内容。这个文件负责的是知识库列表页的`新建`按钮点击后的菜单，只有在该文件添加知识库后，才能创建知识库。

![](/imgs/thirddataset-11.png)

在`FastGPT\projects\app\src\pageComponents\dataset\detail\Info\index.tsx`文件下，添加如下内容。此处配置对应ui界面的如下。

| | |
| --- | --- |
![](/imgs/thirddataset-12.png)|![](/imgs/thirddataset-13.png)

## 添加配置表单

在`FastGPT\projects\app\src\pageComponents\dataset\ApiDatasetForm.tsx`文件下，添加自己如下内容。这个文件负责的是创建知识库页的字段填写。

| | | |
| --- | --- | --- |
| ![](/imgs/thirddataset-14.png) | ![](/imgs/thirddataset-15.png) | ![](/imgs/thirddataset-16.png) |

代码中添加的两个组件是对根目录选择的渲染，对应设计的 api 的 getfiledetail 方法，如果你的知识库不支持，你可以不引用。

```
{renderBaseUrlSelector()} //这是对`Base URL`字段的渲染
{renderDirectoryModal()} //点击`选择`后出现的`选择根目录`窗口，见图
```

| | |
| --- | --- | 
| ![](/imgs/thirddataset-17.png) | ![](/imgs/thirddataset-18.png) |

如果知识库需要支持根目录，还需要在`ApiDatasetForm`文件中添加如下内容。

### 1. 解析知识库类型

需要从`apiDatasetServer`解析出自己的知识库类型，如图：

![](/imgs/thirddataset-19.png)

### 2. 添加选择根目录逻辑和`parentId`赋值逻辑

需要添加根目录选择逻辑，来确保用户已经填写了调动的 api 方法所必需的字段，比如 Token 之类的。

![](/imgs/thirddataset-20.png)

### 3. 添加字段检查和赋值逻辑

需要在调用方法前再次检测是否以及获取完所有必须字段，在选择根目录后，将根目录值赋值给对应的字段。

![](/imgs/thirddataset-21.png)

## 提示

建议知识库创建完成后，完整测试一遍知识库的功能，以确定有无漏洞，如果你的知识库添加有问题，且无法在文档找到对应的文件解决，一定是杂项没有添加完全，建议重复一次全局搜索`YuqueServer`和`yuqueServer`,检查是否有地方没有加上自己的类型。