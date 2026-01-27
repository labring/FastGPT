# 维度 2: FastGPT 风格规范

> FastGPT 项目特定的代码规范和约定。这些规范关注项目特定的开发模式和架构要求。

本文档详细说明 FastGPT 项目中各类代码开发的特定规范和审查要点,确保代码符合项目的架构模式和最佳实践。

## 目录

- [1. 工作流节点开发规范](#1-工作流节点开发规范)
- [2. API 路由开发规范](#2-api-路由开发规范)
- [3. 前端组件开发规范](#3-前端组件开发规范)
- [4. 数据库操作规范](#4-数据库操作规范)
- [5. 包结构与依赖规范](#5-包结构与依赖规范)

---

## 1. 工作流节点开发规范

工作流节点是 FastGPT 的核心组件,开发时需要严格遵循架构要求。

### 1.1 类型定义

**文件位置**: `packages/global/core/workflow/template/system/interactive/type.d.ts`

**审查要点**:
- ✅ 新节点类型定义在 `type.d.ts` 中
- ✅ 使用 `type` 而不是 `interface` (项目约定)
- ✅ 类型定义包含所有必要的字段
- ✅ 导出类型供其他模块使用

**示例**:
```typescript
// 定义交互节点响应类型
export type YourInteractiveNode = InteractiveNodeType & {
  type: 'yourNodeType';
  params: {
    description: string;
    yourField: YourItemType[];
    submitted?: boolean;
  };
};

// 添加到联合类型
export type InteractiveNodeResponseType =
  | UserSelectInteractive
  | UserInputInteractive
  | YourInteractiveNode  // 新增
  | ChildrenInteractive;
```

### 1.2 节点枚举

**文件位置**: `packages/global/core/workflow/node/constant.ts`

**审查要点**:
- ✅ 新节点类型添加到 `FlowNodeTypeEnum`
- ✅ 枚举值使用 camelCase
- ✅ 枚举值清晰表达节点用途

**示例**:
```typescript
export enum FlowNodeTypeEnum {
  // ... 现有类型
  yourNodeType = 'yourNodeType',  // 新增
}
```

### 1.3 节点模板

**文件位置**: `packages/global/core/workflow/template/system/interactive/yourNode.ts`

**审查要点**:
- ✅ 使用 `FlowNodeTemplateType` 类型
- ✅ 设置 `templateType` 为正确的类型
- ✅ 使用 `i18nT` 进行国际化
- ✅ 定义清晰的输入输出结构
- ✅ `isTool` 标记正确 (工具节点设为 true)

**示例**:
```typescript
export const YourNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.yourNodeType,
  templateType: FlowNodeTemplateTypeEnum.interactive,
  flowNodeType: FlowNodeTypeEnum.yourNodeType,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/yourNode',
  name: i18nT('app:workflow.your_node'),
  intro: i18nT('app:workflow.your_node_tip'),
  isTool: true,  // 工具节点

  inputs: [
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('app:workflow.node_description'),
      placeholder: i18nT('app:workflow.your_node_placeholder')
    }
  ],

  outputs: [
    {
      id: NodeOutputKeyEnum.yourResult,
      key: NodeOutputKeyEnum.yourResult,
      required: true,
      label: i18nT('workflow:your_result'),
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
```

### 1.4 节点执行逻辑

**文件位置**: `packages/service/core/workflow/dispatch/interactive/yourNode.ts`

**审查要点**:
- ✅ 函数签名使用 `ModuleDispatchProps` 泛型
- ✅ 返回类型使用 `DispatchNodeResultType`
- ✅ 两阶段执行: 第一次返回 interactive,第二次处理用户输入
- ✅ **重要**: 第二阶段必须设置 `node.isEntry = false`
- ✅ 使用 `rewriteHistories` 清理交互历史
- ✅ 错误处理完善

**关键模式**:
```typescript
export const dispatchYourNode = async (props: Props): Promise<YourNodeResponse> => {
  const { histories, node, params: { description, yourField }, query } = props;
  const { isEntry } = node;

  // 第一阶段: 非入口或交互类型不匹配,返回交互请求
  if (!isEntry || lastInteractive?.type !== 'yourNodeType') {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'yourNodeType',
        params: {
          description,
          yourField
        }
      }
    };
  }

  // 第二阶段: 处理用户提交的数据
  node.isEntry = false;  // 🔴 必须: 重置入口标志

  // 处理用户输入...
  const userInput = parseUserInput(query);

  return {
    data: {
      [NodeOutputKeyEnum.yourResult]: userInput
    },
    // 移除交互对话的历史记录 (最后2条)
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2),
    [DispatchNodeResponseKeyEnum.toolResponses]: userInput,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      yourResult: userInput
    }
  };
};
```

### 1.5 回调注册

**文件位置**: `packages/service/core/workflow/dispatch/constants.ts`

**审查要点**:
- ✅ 在 `callbackMap` 中注册节点
- ✅ 导入执行函数
- ✅ 确保枚举值匹配

**示例**:
```typescript
import { dispatchYourNode } from './interactive/yourNode';

export const callbackMap: Record<FlowNodeTypeEnum, any> = {
  // ... 现有节点
  [FlowNodeTypeEnum.yourNodeType]: dispatchYourNode,
};
```

### 1.6 isEntry 白名单

**文件位置**: `packages/service/core/workflow/dispatch/index.ts` (约 1012-1019 行)

**审查要点**:
- ✅ 交互节点类型添加到 isEntry 白名单
- ✅ 这些节点的 isEntry 标志不会被自动重置

**示例**:
```typescript
// 交互节点不会自动重置 isEntry 标志 (因为需要根据 isEntry 字段来判断是首次进入还是流程进入)
runtimeNodes.forEach((item) => {
  if (
    item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
    item.flowNodeType !== FlowNodeTypeEnum.formInput &&
    item.flowNodeType !== FlowNodeTypeEnum.agent &&
    item.flowNodeType !== FlowNodeTypeEnum.yourNodeType  // 新增
  ) {
    item.isEntry = false;
  }
});
```

### 1.7 前端组件

**文件位置**:
- 聊天组件: `projects/app/src/components/core/chat/components/Interactive/InteractiveComponents.tsx`
- 工作流编辑器: `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeYourNode.tsx`

**审查要点**:
- ✅ 使用 React.memo 包裹组件
- ✅ 使用 useForm 管理表单状态
- ✅ 支持禁用状态 (submitted)
- ✅ 使用 Chakra UI 组件
- ✅ 响应式设计

### 1.8 国际化

**文件位置**: `packages/web/i18n/` (zh-CN, en, zh-Hant)

**审查要点**:
- ✅ 所有语言的翻译文件都更新
- ✅ key 使用有意义的命名
- ✅ 使用命名空间 `workflow:` 或 `app:`

**示例**:
```json
{
  "workflow": {
    "your_node": "你的节点名称",
    "your_node_tip": "节点功能说明",
    "your_result": "节点输出结果"
  }
}
```

---

## 2. API 路由开发规范

FastGPT 使用 Next.js API Routes,需要遵循特定的开发模式。

### 2.1 路由定义

**文件位置**: `projects/app/src/pages/api/`

**审查要点**:
- ✅ 路由文件使用命名导出,不支持默认导出
- ✅ 使用 `NextAPIRequest` 和 `NextAPIResponse` 类型
- ✅ 支持的 HTTP 方法明确 (`GET`, `POST`, `PUT`, `DELETE`)
- ✅ 返回统一的响应格式

**示例**:
```typescript
import type { NextAPIRequest, NextAPIResponse } from '@fastgpt/service/type/next';
import { APIError } from '@fastgpt/service/core/error/controller';

export default async function handler(req: NextAPIRequest, res: NextAPIResponse) {
  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // 处理逻辑...
    const result = await processData(req.body);

    res.json(result);
  } catch (error) {
    APIError(error)(req, res);
  }
}
```

### 2.2 类型合约

**文件位置**: `packages/global/openapi/`

**审查要点**:
- ✅ API 合约定义在 OpenAPI 规范文件中
- ✅ 请求参数有完整的类型定义
- ✅ 响应格式有完整的类型定义
- ✅ 错误响应有说明

### 2.3 业务逻辑

**文件位置**:
- 通用逻辑: `packages/service/`
- 项目特定逻辑: `projects/app/src/service/`

**审查要点**:
- ✅ 业务逻辑与 API 路由分离
- ✅ 服务函数有明确的类型定义
- ✅ 错误处理统一

### 2.4 权限验证

**审查要点**:
- ✅ 所有 API 路由都有权限验证 (除了公开端点)
- ✅ 使用 `parseHeaderCert` 解析认证头
- ✅ 验证用户对资源的所有权
- ✅ 敏感操作需要额外验证

**示例**:
```typescript
import { parseHeaderCert } from '@fastgpt/global/support/permission/controller';

export default async function handler(req: NextAPIRequest, res: NextAPIResponse) {
  try {
    // 解析认证头
    const { userId, teamId } = await parseHeaderCert(req);

    // 验证权限
    const resource = await Resource.findById(resourceId);
    if (!resource || resource.userId !== userId) {
      throw new Error('Permission denied');
    }

    // 继续处理...
  } catch (error) {
    APIError(error)(req, res);
  }
}
```

### 2.5 错误处理

**审查要点**:
- ✅ 使用 try-catch 包裹所有异步操作
- ✅ 使用 `APIError` 统一错误响应
- ✅ 错误信息不暴露敏感数据
- ✅ HTTP 状态码正确

---

## 3. 前端组件开发规范

FastGPT 使用 React + TypeScript + Chakra UI。

### 3.1 组件结构

**审查要点**:
- ✅ 使用函数式组件和 Hooks
- ✅ 组件使用 `React.memo` 优化性能
- ✅ Props 有明确的类型定义
- ✅ 使用 TypeScript type 而不是 interface (项目约定)

**示例**:
```typescript
import React from 'react';
import { Box, Button } from '@chakra-ui/react';

type YourComponentProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
};

export const YourComponent = React.memo(function YourComponent({
  title,
  onClick,
  disabled = false
}: YourComponentProps) {
  return (
    <Box>
      <Button onClick={onClick} isDisabled={disabled}>
        {title}
      </Button>
    </Box>
  );
});
```

### 3.2 状态管理

**审查要点**:
- ✅ 本地状态使用 `useState`
- ✅ 全局状态使用 Zustand store
- ✅ 表单状态使用 `useForm` (react-hook-form)
- ✅ 复杂状态逻辑使用 `useReducer`

### 3.3 样式规范

**审查要点**:
- ✅ 优先使用 Chakra UI props
- ✅ 响应式设计使用 Chakra UI 的断点系统
- ✅ 自定义样式放在 `styles/theme.ts`
- ✅ 避免内联样式

**示例**:
```typescript
// ❌ 不好的实践
<Box style={{ backgroundColor: 'blue', padding: '16px' }}>

// ✅ 好的实践
<Box bg="blue.500" p={4}>
```

### 3.4 国际化

**审查要点**:
- ✅ 所有用户可见文本使用 `i18nT`
- ✅ 翻译 key 使用命名空间
- ✅ 动态文本使用插值

**示例**:
```typescript
import { i18nT } from '@fastgpt/web/i18n/utils';

const message = i18nT('user:welcome', { name: userName });
```

### 3.5 性能优化

**审查要点**:
- ✅ 列表渲染使用 key
- ✅ 大列表使用虚拟化
- ✅ 避免在渲染中创建新对象/函数
- ✅ 使用 `useMemo` 缓存计算结果
- ✅ 使用 `useCallback` 缓存函数

---

## 4. 数据库操作规范

FastGPT 使用 MongoDB (Mongoose) 和 PostgreSQL。

### 4.1 Model 定义

**文件位置**: `packages/service/common/mongo/schema/`

**审查要点**:
- ✅ Schema 定义使用 TypeScript 泛型
- ✅ 必要的字段添加索引
- ✅ 敏感字段加密存储
- ✅ 定义虚拟字段和实例方法

**示例**:
```typescript
import { mongoose, Schema } from '@fastgpt/service/common/mongo';

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },  // 默认不查询
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 索引
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });

// 虚拟字段
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

export const User = mongoose.model('User', UserSchema);
```

### 4.2 查询操作

**审查要点**:
- ✅ 使用参数化查询防止注入
- ✅ 避免 N+1 查询
- ✅ 使用 projection 只查询需要的字段
- ✅ 大结果集使用分页
- ✅ 异步操作有错误处理

**示例**:
```typescript
// ❌ 不好的实践
const users = await User.find({}).toArray();  // 可能返回大量数据

// ✅ 好的实践
const users = await User.find({})
  .project({ username: 1, email: 1 })  // 只查询需要的字段
  .limit(20)  // 限制结果数量
  .skip(page * 20)
  .toArray();
```

### 4.3 错误处理

**审查要点**:
- ✅ 数据库操作使用 try-catch
- ✅ 处理重复键错误 (code 11000)
- ✅ 处理连接错误
- ✅ 错误日志包含上下文信息

---

## 5. 包结构与依赖规范

FastGPT 是一个 monorepo,使用 pnpm workspaces。

### 5.1 包结构

```
packages/
├── global/          # 类型、常量、工具函数 (无运行时依赖)
├── service/         # 后端服务、数据库模型 (依赖 global)
└── web/             # 前端组件、样式、i18n (依赖 global)

projects/
├── app/             # NextJS 应用 (依赖所有 packages)
├── sandbox/         # NestJS 沙箱服务 (独立应用)
└── mcp_server/      # MCP 服务器 (独立应用)
```

### 5.2 依赖规则

**审查要点**:
- ✅ `packages/global/` 无任何运行时依赖
- ✅ `packages/service/` 只依赖 `packages/global/`
- ✅ `packages/web/` 只依赖 `packages/global/`
- ✅ `projects/app/` 可以依赖所有 packages
- ✅ 独立项目 (sandbox, mcp_server) 最小化依赖

### 5.3 导入规范

**审查要点**:
- ✅ 使用项目别名导入: `@fastgpt/global`, `@fastgpt/service`, `@fastgpt/web`
- ✅ 避免相对路径导入跨包的文件
- ✅ 导入路径使用 index 简化

**示例**:
```typescript
// ❌ 不好的导入
import { UserType } from ../../../../../packages/global/core/user/type.d.ts;

// ✅ 好的导入
import { UserType } from '@fastgpt/global/core/user/type';
```

### 5.4 类型导出

**审查要点**:
- ✅ 公共类型必须导出
- ✅ 类型文件使用 `.d.ts` 扩展名
- ✅ 复杂类型放在独立的类型文件
- ✅ 使用 `export type` 导出类型

---
