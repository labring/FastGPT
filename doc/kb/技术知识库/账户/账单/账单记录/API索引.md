---
capability_label: 账单记录
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T11:30:00.000Z
parent_module: 账单
roles: []
router_paths:
  - /account/bill
---

# 账单记录 — API索引

## 账单查询与列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /proApi/support/wallet/bill/list | POST | 获取账单列表（分页+筛选） | api.ts:15 → BillTable.tsx:69 | 账户→账单→账单记录Tab→加载时调用；账户→账单→账单记录Tab→切换类型筛选时调用；账户→账单→账单记录Tab→翻页时调用；账户→账单→账单记录→支付成功/取消后刷新时调用 |
| /proApi/support/wallet/bill/detail | GET | 获取单笔账单详情 | api.ts:41 → BillDetailModal.tsx:26 | 账户→账单→账单记录→点击「详情」按钮→弹窗打开时调用 |

## 支付操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /proApi/support/wallet/bill/pay/checkPayResult | GET | 检查支付结果 | api.ts:21 → BillTable.tsx:80 | 账户→账单→账单记录→点击未支付账单的「更新」按钮时调用 |
| /proApi/support/wallet/bill/pay/updatePayment | PUT | 更新支付信息（获取新支付凭据） | api.ts:33 → BillTable.tsx:88 | 账户→账单→账单记录→支付检查返回未支付时调用（获取二维码/支付URL） |

## 账单管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /proApi/support/wallet/bill/cancel | POST | 取消账单 | api.ts:38 → BillTable.tsx:124 | 账户→账单→账单记录→点击未支付账单的「取消」按钮并确认后调用 |

---

## API 调用链追踪

### `/proApi/support/wallet/bill/list` 调用链

```
BillTable (projects/app/src/pageComponents/account/bill/BillTable.tsx)
  ├── 触发: 组件挂载时（usePagination 自动触发首次请求）
  ├── 参数: { pageNum, pageSize: 20, type?: BillTypeEnum }
  ├── 响应处理: 数据存入 bills 状态；total/pageSize 控制分页器显示
  └── 刷新依赖: billType 变更时自动重新请求第 1 页

BillTable — 操作后刷新 (getData(1))
  ├── 触发: 支付成功后 / 取消账单成功后 / 支付弹窗关闭后
  └── 参数: { pageNum: 1, pageSize: 20, type: 当前筛选 }
```

### `/proApi/support/wallet/bill/detail` 调用链

```
BillDetailModal (projects/app/src/pageComponents/account/bill/BillDetailModal.tsx)
  ├── 触发: BillTable 中点击某条账单的「详情」按钮 → 设置 billDetailId → 渲染 BillDetailModal
  ├── 参数: { billId: 账单 ObjectId }
  ├── 响应处理: 数据存入 bill 状态；根据 metadata 字段条件渲染详情信息行
  └── 依赖刷新: billId 变更时重新请求
```

### `/proApi/support/wallet/bill/pay/checkPayResult` 调用链

```
BillTable → handleRefreshPayOrder (projects/app/src/pageComponents/account/bill/BillTable.tsx)
  ├── 触发: 用户点击未支付账单的「更新」按钮
  ├── 参数: payId (账单 _id)
  ├── 响应处理 (SUCCESS): Toast 提示「支付成功」→ 内部调用 /common/system/unlockTask → getData(1) 刷新列表
  ├── 响应处理 (NOTPAY): 调用 putUpdatePayment 获取支付凭据 → 企微支付打开 URL / 其他展示 QRCodePayModal
  └── 响应处理 (CLOSED/其他): Toast 提示 description 内容
```

### `/proApi/support/wallet/bill/pay/updatePayment` 调用链

```
BillTable → handleRefreshPayOrder (projects/app/src/pageComponents/account/bill/BillTable.tsx)
  ├── 触发: checkBalancePayResult 返回 status=NOTPAY 后自动调用
  ├── 参数: { billId, payWay }
  ├── 响应处理 (wecom): payUrl 存在 → Toast 提示后 window.open(payUrl)
  └── 响应处理 (其他): 设置 qrPayData 状态 → 渲染 QRCodePayModal 弹窗
```

### `/proApi/support/wallet/bill/cancel` 调用链

```
BillTable → handleCancelBill (projects/app/src/pageComponents/account/bill/BillTable.tsx)
  ├── 触发: 用户点击未支付账单的「取消」按钮 → PopoverConfirm 确认后调用
  ├── 参数: { billId }
  └── 响应处理: 成功后 getData(1) 刷新列表
```
