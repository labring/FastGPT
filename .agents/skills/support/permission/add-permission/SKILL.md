---
name: add-permission
description: 为 FastGPT 新资源接入权限管理。当用户需要为新资源（如 AgentSkill、Plugin 等）添加权限支持时触发。
---

# 新资源权限接入

## 你的资源是哪种类型？

```
资源有父子/文件夹结构吗？
     │
     ├─ 否 ──► 简单资源 ──► [快速入门](./guides/quick-start.md)
     │
     └─ 是 ──► 资源支持权限继承吗？
                    │
                    ├─ 否 ──► 简单资源 ──► [快速入门](./guides/quick-start.md)
                    │
                    └─ 是 ──► 继承型资源 ──► [完整接入](./guides/full-integration.md)
```

## 快速链接

| 我想... | 去看... |
|---------|---------|
| 5 步完成最小接入 | [快速入门](./guides/quick-start.md) |
| 接入继承型资源 | [完整接入](./guides/full-integration.md) |
| 检查遗漏项 | [实施清单](./checklist.md) |
| 理解权限系统原理 | [参考文档](./reference/README.md) |

## 关键代码位置

| 文件 | 用途 |
|------|------|
| `packages/global/support/permission/constant.ts` | 添加 `PerResourceTypeEnum` |
| `packages/global/support/permission/{resource}/` | 权限常量 + Permission 类 |
| `packages/service/support/permission/{resource}/auth.ts` | 鉴权函数 |
