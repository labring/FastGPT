---
title: "如何开发系统工具"
description: "FastGPT 系统工具开发指南"
icon: "home_repair_service"
draft: false
toc: true
weight: 302
---

## 介绍

FastGPT 系统工具项目从 4.10.0 版本后移动到独立的`fastgpt-plugin`项目中，采用纯代码的模式进行工具编写。你可以在`fastgpt-plugin`项目中进行独立开发和调试好插件后，直接向 FastGPT 官方提交 PR 即可，无需运行 FastGPT 主服务。

## 概念

- 工具(Tool)：最小的运行单元，每个工具都有唯一 ID 和特定的输入和输出。
- 工具集(Toolset)：工具的集合，可以包含多个工具。

在`fastgpt-plugin`中，你可以每次创建一个工具/工具集，每次提交时，仅接收一个工具/工具集。如需开发多个，可以创建多个 PR 进行提交。

## 1. 准备工作

- Fork[fastgpt-plugin 项目](https://github.com/labring/fastgpt-plugin)
- 安装[Bun](https://bun.sh/)
- 本地拉取项目进行 Dev 开发。
  - bun install
  - bun run dev

## 2. 初始化一个新的工具/工具集

### 2.1 执行创建命令

```bash
bun run new:tool
```

依据提示分别选择创建工具/工具集，以及目录名（小驼峰命名）。

执行完后，系统会在 `packages/tool/packages/[your-tool-name]`下生成一个工具/工具集的目录。

系统工具 (Tool) 文件结构如下:

```plaintext
src // 源代码，处理逻辑
└── index.ts
test // 测试样例
└── index.test.ts
config.ts // 配置，配置工具的名称、描述、类型、图标等
index.ts // 入口，不要改这个文件
logo.svg // Logo，替换成你的工具的 Logo
package.json // npm 包
```

工具集(toolset) 的文件结构如下：

```plaintext
children
└── tool // 这个里面的结构就和上面的 tool 基本一致
config.ts
index.ts
logo.svg
package.json
```

### 2.2 修改 config.ts

- **name** 和 **description** 字段为中文和英文两种语言
- **courseUrl** 密钥获取链接，或官网链接。
- **author** 开发者名
- **type** 为枚举类型，目前有:
	- tools: 工具
	- search: 搜索
	- multimodal: 多模态
	- communication: 通讯
	- other: 其他
- **versionList** (工具中配置)用于版本管理，是一个列表，其中的元素格式:
	- value：版本号，建议使用 semver
	- description: 描述
	- inputs 入参
	- outputs 返回值
- **children**：（工具集 toolset 配置），需要将 tool import 后手动写入。

对于 ToolSet 下的 tool 来说，无需填写 `type`、`courseUrl`、`author`，这几个字段会继承 ToolSet 的配置。

#### inputs 参数格式

一般格式:

```ts
{
  key: '本工具内唯一的 key，和 src/index.ts 中的 InputType 定义相同',
  label: '前端显示的 label',
  renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference], // 前端输入框的类型
  valueType: WorkflowIOValueTypeEnum.string, // 数据类型
  toolDescription: '工具调用时用到的描述' // 如果需要设置成工具调用参数，需要设置这个字段
}
```

有一个特殊的 key `'system_input_config'`，其用于配置工具的`激活信息`,通常包含`密钥`、`Endpoint`、`Port`等。

配置中`inputType=secret`的数据，将会通过对称加密的方式保存，以保证安全性。

**参考 dalle3**:

```
"inputs": [
  {
    key: 'system_input_config', // 必须为这个值
    label: '', // 为空即可
    inputList: [
    {
      key: 'url',
      label: 'Dalle3 接口基础地址',
      description: '例如：https://api.openai.com',
      required: true,
      inputType: 'input'
    },
    {
      key: 'authorization',
      label: '接口凭证（不需要 Bearer）',
      description: 'sk-xxxx',
      required: true,
      inputType: 'secret'
    }
    ],
    renderTypeList: [FlowNodeInputTypeEnum.hidden], // 必须为这个值
    valueType: WorkflowIOValueTypeEnum.object // 必须为这个值
  },
....
]
```

#### outputs 参数格式
```
{
  key: 'link', // 唯一键值对
  valueType: WorkflowIOValueTypeEnum.string, // 具体可以看这个 Enum 的类型定义
  label: '图片访问链接', // 名字
  description: '图片访问链接' // 描述，可选
}
```

## 2. 编写处理逻辑

在 `[your-tool-name]/src/index.ts` 为入口编写处理逻辑，需要注意：

1. 使用 zod 进行类型定义，导出为 InputType 和 OutputType 两个 Schema。
2. 入口函数为 `tool`，可以定义其他的函数。

```ts
import { format } from 'date-fns';
import { z } from 'zod';

export const InputType = z.object({
  formatStr: z.string().optional()
});

export const OutputType = z.object({
  time: z.string()
});

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const formatStr = props.formatStr || 'yyyy-MM-dd HH:mm:ss';

  return {
    time: format(new Date(), formatStr)
  };
}
```

上述例子给出了一个传入 formatStr （格式化字符串）并且返回当前时间的简单样例，如需安装包，可以在`/packages/tools/packages/[your-tool-name]`路径下，使用`bun install PACKAGE` 进行安装。

## 3. 调试

### 单测

在 `test/index.test.ts` 中编写测试样例，使用 `bun run test index.test.ts完整路径` 即可运行测试。

### 从 OpenAPI 文件进行测试

浏览器打开`localhost:3000/openapi`可进入`fastgpt-plugin`的 OpenAPI 页面，进行 API 调试。

![](/imgs/plugin-openapi.png)

可以先通过`/tool/list`接口，获取工具列表，找到需要调试的工具的`toolId`。紧接着，通过`/tool/run`来运行工具获取实际结果。

![](/imgs/plugin-openapi2.png)

### 从 FastGPT 主服务进行测试

如果本地运行有`FastGPT`主服务，则可以直接添加对应的工具进行测试。

### 可视化调试（TODO）

## 4. 提交工具至官方目录

完毕上述所有内容后，向官方仓库 `https://github.com/labring/fastgpt-plugin` 提交 PR。官方人员审核通过后即可收录为 FastGPT 的官方插件。

如无需官方收录，可自行对该项目进行 Docker 打包，并替换官方镜像即可。

