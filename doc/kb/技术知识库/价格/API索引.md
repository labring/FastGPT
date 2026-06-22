---
capability_label: 价格
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: null
roles: [团队管理员, 团队成员]
router_paths: [/price]
---

# 价格 — API索引

## 订阅与账单

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/bill/create` | POST | 创建支付账单（订阅/积分/容量） | `src/web/support/wallet/bill/api.ts:19` → `src/pageComponents/price/Standard.tsx:147`；`src/pageComponents/price/ExtraPlan.tsx:62,99` | 价格→价格中心→购买套餐→点击购买/续费/升级时调用；价格→额外AI积分→点击购买时调用；价格→额外知识库容量→点击购买时调用 |
| `/support/user/team/plan/getTeamPlanStatus` | GET | 获取团队订阅计划状态 | `src/web/support/user/team/api.ts:122` → `src/pages/price/index.tsx:31` | 价格→价格中心→页面初始化时调用（依赖 userInfo 加载完成后触发） |
| `/proApi/support/wallet/discountCoupon/list` | GET | 获取团队优惠券列表 | `src/web/support/wallet/sub/discountCoupon/api.ts:4` → `src/pageComponents/price/Standard.tsx:73` | 价格→价格中心→页面初始化→teamId 可用时自动获取；套餐卡片判断折扣适用性 |

## 用户数据

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `useUserStore.initUserInfo` (Store) | — | 初始化用户信息和团队数据 | `src/web/support/user/useUserStore` → `src/pages/price/index.tsx:27` | 价格→价格中心→页面初始化时调用 |

### `POST /proApi/support/wallet/bill/create` 调用链

```
Standard.tsx
  ├── 触发: 用户点击套餐卡片的"购买"/"续费"/"升级套餐"按钮
  ├── 参数: { type: BillTypeEnum.standSubPlan, level, subMode, discountCouponId }
  └── 响应处理: payUrl → 新标签页打开支付链接；其他 → setQRPayData 显示二维码支付弹窗

ExtraPlan.tsx (AI 积分)
  ├── 触发: 用户选择积分包后点击"购买"
  ├── 参数: { type: BillTypeEnum.extraPoints, extraPoints, month }
  └── 响应处理: setQRPayData 显示二维码支付弹窗

ExtraPlan.tsx (知识库容量)
  ├── 触发: 用户设置容量和有效期后点击"购买"
  ├── 参数: { type: BillTypeEnum.extraDatasetSub, month, extraDatasetSize }
  └── 响应处理: setQRPayData 显示二维码支付弹窗
```

### `GET /support/user/team/plan/getTeamPlanStatus` 调用链

```
PriceBox (index.tsx)
  ├── 触发: 页面初始化，useUserStore.initUserInfo 完成后自动触发
  ├── 参数: 无（依赖全局登录状态，maxQuantity: 1 避免重复请求）
  └── 响应处理: 写入 useUserStore.teamPlanStatus，驱动 Standard 组件中的套餐当前状态判断
```

### `GET /proApi/support/wallet/discountCoupon/list` 调用链

```
Standard.tsx
  ├── 触发: 页面初始化，myStandardPlan.teamId 可用后自动请求
  ├── 参数: { teamId }
  └── 响应处理: 匹配当前付费模式的折扣券（月付→7折券，年付→9折券），影响套餐卡片价格展示
```
