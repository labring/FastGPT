---
title: '第三方知识库开发'
description: '本节详细介绍如何在FastGPT上自己接入第三方知识库'
icon: 'language'
draft: false
toc: true
weight: 410
---

目前，互联网上拥有各种各样的文档库，例如飞书，语雀等等。 FastGPT 的不同用户可能使用的文档库不同，然而开发人手不够，FastGPT 目前只支持飞书，语雀，api ，web 站点这几个知识库。为了满足广大用户对其他知识库需求，同时增强开源性，现在教学如何自己开发第三方知识库。

## 准备本地开发环境

想要开发 FastGPT ,首先要拥有本地开发环境，具体参考[快速开始本地开发](../../development/intro.md)

## 开始开发

为了方便讲解，这里以添加飞书知识库为例。

首先，要进入 FastGPT 项目路径下的`FastGPT\packages\global\core\dataset\apiDataset.d.ts`文件，添加自己的知识库 Server 类型。

{{% alert icon="🤖 " context="success" %}}
知识库类型的字段设计是依赖于自己的知识库需要什么字段进行后续的api调用。
如果知识库有`根目录`选择的功能，需要设置添加一个字段`basePath`。[点击查看`根目录`功能](/docs/guide/knowledge_base/third_dataset/#添加配置表单)
{{% /alert %}}

![](/imgs/thirddataset-1.png)

然后需要在 FastGPT 项目路径`FastGPT\packages\service\core\dataset\apiDataset\`下创建一个需要添加的文件夹，这里是`feishuKownledgeDataset`,在添加的文件夹下创建一个`api.ts`,如图:

![](/imgs/thirddataset-2.png)

## `api.ts`文件内容

首先，需要完成一些导入操作，例如

```TS
import type {
  APIFileItem,
  ApiFileReadContentResponse,
  ApiDatasetDetailResponse,
  FeishuKnowledgeServer //这里是之前添加的知识库类型Server
} from '@fastgpt/global/core/dataset/apiDataset';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import axios, { type Method } from 'axios';
import { addLog } from '../../../common/system/log';
```

之后定义一些返回体，需要根据自己要调用的 api 接口的返回类型进行设计。这里例如：
```TS
type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
};

/**
 * Request
 */
type FeishuFileListResponse = {
  items: {
    title: string;
    creator: string;
    has_child: boolean;
    parent_node_token: string;
    owner_id: string;
    space_id: string;
    node_token: string;
    node_type: string;
    node_create_time: number;
    obj_edit_time: number;
    obj_create_time: number;
    obj_token: string;
    obj_type: string;
    origin_node_token: string;
    origin_space_id: string;
  }[];
  has_more: boolean;
  next_page_token: string;
};
```

需要先设计设计一个函数，函数名以`知识库类型+Request`为例，例如:

```TS
export const useFeishuKnowledgeDatasetRequest = ({
  feishuKnowledgeServer
}: {
  feishuKnowledgeServer: FeishuKnowledgeServer;
}) => {}
```

函数定义完成后，需要完成 api 方法的设计，需要以下四个方法：

{{% alert icon="🤖 " context="success" %}}
方法的具体设计，可以参考`projects\app\src\service\core\dataset\`下的任何一个知识库的`api.ts`文件，知识库文件夹以`dataset`结尾
{{% /alert %}}

| 方法名 | 返回体 | 说明 |
| --- | --- | --- |
| listFiles | id,parentId,name,type,hasChild,updateTime,createTime | 用于获取知识库的文件列表 |
| getFileContent | title,rawText | 用于获取知识库文件内容 |
| getFileDetail | name,parentId,id | 用于获取知识库文件详细信息 |
| getFilePreviewUrl | '网址' | 用于获取知识库文件原始页面 |

在设计好`api.ts`文件后，需要在`projects\app\src\service\core\dataset\apidataset\index.ts`里，添加之前写好的函数，例如:

![](/imgs/thirddataset-3.png)

在完成了这些之后，现在，我们需要一些方法的支持。在`index.ts`文件里，查找函数`getApiDatasetRequest`的引用，如图:

![](/imgs/thirddataset-4.png)

{{% alert icon="🤖 " context="warning" %}}
其中`getCatalog.ts`和`getPathNames.ts`文件是对根路径设置的支持，如果你的知识库不支持根路径设置，可以设置返回空。[点击查看`根目录`功能](/docs/guide/knowledge_base/third_dataset/#添加配置表单)如图:

![](/imgs/thirddataset-6.png)

{{% /alert %}}

可以看到有一些文件引用这个函数，这些就是知识库的方法，现在我们需要进入这些文件添加我们的知识库类型。以`list.ts`为例，如图添加：

![](/imgs/thirddataset-5.png)

{{% alert icon="🤖 " context="success" %}}
方法的具体添加，可以参考文件内的其他知识库。
{{% /alert %}}

在`FastGPT\projects\app\src\pages\api\core\dataset\detail.ts`文件中，添加如下内容。

![](/imgs/thirddataset-22.png)

在`FastGPT\projects\app\src\pages\api\core\dataset\update.ts`文件中，添加如下内容。

{{% alert icon="🤖 " context="warning" %}}
该文件主要是负责更新知识库配置的，如果不添加，会导致无法正常更新配置。
{{% /alert %}}

![](/imgs/thirddataset-23.png)



## 数据库类型添加

添加新的知识库，需要在`packages/service/core/dataset/schema.ts` 中添加自己的知识库类型，如图：

![](/imgs/thirddataset-7.png)

{{% alert icon="🤖 " context="success" %}}
`schema.ts`文件修改后，需要重新启动 FastGPT 项目才会生效。
{{% /alert %}}


## 添加知识库类型

添加完这些之后，需要添加知识库类型，需要在`projects/app/src/web/core/dataset/constants.ts`中，添加自己的知识库类型

```TS
export const datasetTypeCourseMap: Record<`${DatasetTypeEnum}`, string> = {
  [DatasetTypeEnum.folder]: '',
  [DatasetTypeEnum.dataset]: '',
  [DatasetTypeEnum.apiDataset]: '/docs/guide/knowledge_base/api_dataset/',
  [DatasetTypeEnum.websiteDataset]: '/docs/guide/knowledge_base/websync/',
  [DatasetTypeEnum.feishuShare]: '/docs/guide/knowledge_base/lark_share_dataset/',
  [DatasetTypeEnum.feishuKnowledge]: '/docs/guide/knowledge_base/lark_knowledge_dataset/',
  [DatasetTypeEnum.yuque]: '/docs/guide/knowledge_base/yuque_dataset/',
  [DatasetTypeEnum.externalFile]: ''
};
```

{{% alert icon="🤖 " context="success" %}}
在 datasetTypeCourseMap 中添加自己的知识库类型，`' '`内是相应的文档说明，如果有的话，可以添加。
文档添加在`FastGPT\docSite\content\zh-cn\docs\guide\knowledge_base\`
{{% /alert %}}

## 添加前端

`FastGPT\packages\web\i18n\zh-CN\dataset.json`,`FastGPT\packages\web\i18n\en\dataset.json`和`FastGPT\packages\web\i18n\zh-Hant\dataset.json`中添加自己的 I18n 翻译，以中文翻译为例，大体需要如下几个内容：

![](/imgs/thirddataset-24.png)

`FastGPT\packages\web\components\common\Icon\icons\core\dataset\`添加自己的知识库图标，一共是两个，分为`Outline`和`Color`，分别是有颜色的和无色的，具体看如下图片。

![](/imgs/thirddataset-10.png)


在`FastGPT\packages\web\components\common\Icon\constants.ts`文件中，添加自己的图标。 `import` 是图标的存放路径。

![](/imgs/thirddataset-9.png)

在`FastGPT\packages\global\core\dataset\constants.ts`文件中，添加自己的知识库类型。

![](/imgs/thirddataset-8.png)

{{% alert icon="🤖 " context="success" %}}
`label`内容是自己之前通过 i18n 翻译添加的知识库名称的
`icon`是自己之前添加的 Icon , I18n 的添加看最后清单。
{{% /alert %}}

在`FastGPT\projects\app\src\pages\dataset\list\index.tsx`文件下，添加如下内容。这个文件负责的是知识库列表页的`新建`按钮点击后的菜单，只有在该文件添加知识库后，才能创建知识库。

![](/imgs/thirddataset-12.png)

在`FastGPT\projects\app\src\pageComponents\dataset\detail\Info\index.tsx`文件下，添加如下内容。

![](/imgs/thirddataset-18.png)

在`FastGPT\projects\app\src\pageComponents\dataset\list\CreateModal.tsx`文件下，添加如下内容。

| | |
| --- | --- | 
| ![](/imgs/thirddataset-19.png) | ![](/imgs/thirddataset-20.png) |

在`FastGPT\projects\app\src\pageComponents\dataset\list\SideTag.tsx`文件下，添加如下内容。

![](/imgs/thirddataset-21.png)

在`FastGPT\projects\app\src\web\core\dataset\context\datasetPageContext.tsx`文件下，添加如下内容。

![](/imgs/thirddataset-23.png)

## 添加配置表单

在`FastGPT\projects\app\src\pageComponents\dataset\ApiDatasetForm.tsx`文件下，添加自己如下内容。这个文件负责的是创建知识库页的字段填写。

| | | |
| --- | --- | --- |
| ![](/imgs/thirddataset-13.png) | ![](/imgs/thirddataset-14.png) | ![](/imgs/thirddataset-15.png) |

代码中添加的两个组件是对根目录选择的渲染，对应设计的 api 的 getfiledetail 方法，如果你的文件不支持，你可以不引用。

```
{renderBaseUrlSelector()} //这是对`Base URL`字段的渲染
{renderDirectoryModal()} //点击`选择`后出现的`选择根目录`窗口，见图
```

| | |
| --- | --- | 
| ![](/imgs/thirddataset-16.png) | ![](/imgs/thirddataset-17.png) |

如果知识库需要支持根目录，还需要在`ApiDatasetForm`文件中添加相关内容。

## 添加杂项

最后，需要在很多文件里添加`server`类型，这里由于文件过多，且不大，不一一列举文件的清单。只提供方法：使用自己编程工具的全局搜索功能，搜索`YuqueServer`和`yuqueServer`。在搜索到的文件中，逐一添加自己的知识库类型。

## 提示

建议知识库创建完成后，完整测试一遍知识库的功能，以确定有无漏洞，如果你的知识库添加有问题，且无法在文档找到对应的文件解决，一定是杂项没有添加完全，建议重复一次全局搜索`YuqueServer`和`yuqueServer`,检查是否有地方没有加上自己的类型。