# 5. 包结构与依赖规范

FastGPT 是一个 monorepo,使用 pnpm workspaces。

## 5.1 包结构

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

## 5.2 依赖规则

**审查要点**:
- ✅ `packages/global/` 无任何运行时依赖
- ✅ `packages/service/` 只依赖 `packages/global/`
- ✅ `packages/web/` 只依赖 `packages/global/`
- ✅ `projects/app/` 可以依赖所有 packages
- ✅ 独立项目 (sandbox, mcp_server) 最小化依赖

## 5.3 导入规范

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

## 5.4 类型导出

**审查要点**:
- ✅ 公共类型必须导出
- ✅ 类型文件使用 `.d.ts` 扩展名
- ✅ 复杂类型放在独立的类型文件
- ✅ 使用 `export type` 导出类型

---
