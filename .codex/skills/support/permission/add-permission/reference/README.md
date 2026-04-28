# 参考文档索引

> 深入理解 FastGPT 权限系统的设计原理和实现细节。

## 文档结构

```
reference/
├── core-concepts.md      ── 核心概念：权限值、角色、协作者
├── permission-class.md   ── Permission 类设计与使用
├── auth-function.md      ── 鉴权函数实现模式
├── inheritance.md        ── 继承机制详解
├── pro-collaborator.md   ── fastgpt-pro 协作者管理
└── pro-owner-transfer.md ── Owner 转移机制
```

## 按场景查阅

| 我想了解... | 去看... |
|-------------|---------|
| 权限值的位字段设计 | [核心概念](./core-concepts.md) |
| 如何扩展 Permission 类 | [Permission 类设计](./permission-class.md) |
| 鉴权函数的标准实现 | [鉴权函数实现](./auth-function.md) |
| 父子资源权限如何合并 | [继承机制](./inheritance.md) |
| 协作者更新如何处理冲突 | [协作者管理](./pro-collaborator.md) |
| Owner 转移的完整流程 | [Owner 转移](./pro-owner-transfer.md) |

