# 5. 包结构与依赖规范

FastGPT 是一个 monorepo,使用 pnpm workspaces。

## 5.1 包结构

```
packages/
├── global/          # 跨端共享的类型、常量、schema、工具
├── service/         # 后端服务、数据库模型 (依赖 global)
└── web/             # 前端组件、样式、i18n (依赖 global)

projects/
├── app/             # NextJS 应用 (依赖所有 packages)
├── code-sandbox/    # Bun + Hono 沙箱服务 (独立应用)
└── mcp_server/      # MCP 服务器 (独立应用)
```

## 5.2 依赖规则

**审查要点**:
- ✅ 按业务域及子功能组织代码；`global/core/` 不引入 mongoose 等服务端依赖
- ✅ workspace 依赖方向保持 `service` → `global`、`web` → `global`；前端不能引入服务端模块
- ✅ `projects/app/` 可以依赖所有 packages
- ✅ 独立项目 (sandbox, mcp_server) 最小化依赖

## 5.3 导入规范

**审查要点**:
- ✅ 使用项目别名导入: `@fastgpt/global`, `@fastgpt/service`, `@fastgpt/web`
- ✅ 避免相对路径导入跨包的文件
- ✅ 直接从成员实际定义文件导入；禁止使用 `index.ts` barrel 或 `export ... from` 聚合、转导其他模块成员

**示例**:
```typescript
// ❌ 不好的导入
import { UserType } from '../../../../../packages/global/core/user/type';

// ✅ 好的导入
import { UserType } from '@fastgpt/global/core/user/type';
```

## 5.4 类型导出

**审查要点**:
- ✅ 公共类型必须导出
- ✅ 类型和 schema 按当前目录规范归属，不强制全部使用 `.d.ts`；schema 优先通过 `z.infer` 推导类型，避免重复声明
- ✅ 复杂类型放在独立的类型文件
- ✅ 使用 `export type` 导出类型
