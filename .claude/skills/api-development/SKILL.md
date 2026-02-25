---
name: api-development
description: FastGPT API 开发规范。重点强调使用 zod schema 定义入参和出参,在 API 文档中声明路由信息,编写对应的 OpenAPI 文档,以及在 API 路由中使用 schema.parse 进行验证。
---

# FastGPT API 开发规范

> FastGPT 项目 API 路由开发的标准化指南,确保 API 的一致性、类型安全和文档完整性。

## 何时使用此技能

- 开发新的 Next.js API 路由
- 修改现有 API 的入参或出参
- 需要 API 类型定义和文档
- 审查 API 相关代码

## 说明文档

[API 设计规范](../design/common/api/index.md)