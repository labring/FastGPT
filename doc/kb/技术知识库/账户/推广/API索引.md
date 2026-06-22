---
capability_label: 推广
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 账户
roles: ["团队所有者"]
router_paths: ["/account/promotion"]
---

# API索引

## API 概览

| 序号 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 1 | GET | `/proApi/support/activity/promotion/getPromotionData` | 获取推广初始化数据 |
| 2 | POST | `/proApi/support/activity/promotion/getPromotions` | 获取推广记录列表（分页） |

---

## 1. 获取推广初始化数据

**请求**

```
GET /proApi/support/activity/promotion/getPromotionData
```

无请求参数。

**响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| `invitedAmount` | `number` | 累计邀请人数 |
| `earningsAmount` | `number` | 累计收益金额（元） |

**调用方**：前端 `getPromotionInitData()`（`@/web/support/activity/promotion/api`）

---

## 2. 获取推广记录列表

**请求**

```
POST /proApi/support/activity/promotion/getPromotions
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pageNum` | `number` | 是 | 页码 |
| `pageSize` | `number` | 是 | 每页条数（默认 20） |

**响应**

分页响应结构，`data` 为 `PromotionRecordType` 数组：

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | `string` | 记录 ID |
| `type` | `'register' \| 'pay'` | 记录类型：注册奖励 / 支付返佣 |
| `createTime` | `Date` | 记录创建时间 |
| `amount` | `number` | 奖励金额 |

**调用方**：前端 `getPromotionRecords()`（`@/web/support/activity/promotion/api`）

---

## 前端 API 封装

| 函数 | HTTP 方法 | 端点 | 说明 |
|------|-----------|------|------|
| `getPromotionInitData()` | GET | `/proApi/support/activity/promotion/getPromotionData` | 返回 `{ invitedAmount, earningsAmount }` |
| `getPromotionRecords(data)` | POST | `/proApi/support/activity/promotion/getPromotions` | 接收 `PaginationProps`，返回分页响应 |

封装文件：`projects/app/src/web/support/activity/promotion/api.ts`

底层请求工具：
- `GET` / `POST` 来自 `@/web/common/api/request`，基于 Axios 封装，自动处理认证（Bearer Token）、请求拦截、响应校验

---

## 数据模型

**PromotionRecordSchema**（`packages/global/support/activity/type.ts`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | `string` | 记录唯一标识 |
| `userId` | `string` | 收益人 ID |
| `objUId` | `string?` | 目标对象（提现时为空） |
| `type` | `'register' \| 'pay'` | 记录类型 |
| `createTime` | `Date` | 记录时间 |
| `amount` | `number` | 金额 |

**PromotionRecordType**（`projects/app/src/global/support/api/userRes.ts`）为前端响应类型，字段与 Schema 对应（不含 `userId` 和 `objUId`）。
