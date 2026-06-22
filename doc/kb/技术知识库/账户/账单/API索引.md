---
capability_label: 账单
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles: [团队管理员]
router_paths: [/account/bill]
---

# 账单 — API 索引

## 账单查询与操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/bill/list` | POST | 获取账单列表（分页） | `web/support/wallet/bill/api.ts:16` → `pageComponents/account/bill/BillTable.tsx:69` | 账户→账单→账单记录Tab→加载/翻页/切换账单类型筛选时调用 |
| `/proApi/support/wallet/bill/detail` | GET | 获取单条账单详情 | `web/support/wallet/bill/api.ts:42` → `pageComponents/account/bill/BillDetailModal.tsx:26` | 账户→账单→账单记录Tab→点击「详情」按钮→打开详情弹窗时调用 |
| `/proApi/support/wallet/bill/pay/checkPayResult` | GET | 检查支付结果 | `web/support/wallet/bill/api.ts:22` → `pageComponents/account/bill/BillTable.tsx:79` | 账户→账单→账单记录Tab→未支付账单→点击「更新」按钮时调用 |
| `/proApi/support/wallet/bill/pay/updatePayment` | PUT | 更新支付方式（获取新支付参数） | `web/support/wallet/bill/api.ts:34` → `pageComponents/account/bill/BillTable.tsx:88` | 账户→账单→账单记录Tab→支付状态仍为未支付→获取新支付二维码时调用 |
| `/proApi/support/wallet/bill/cancel` | POST | 取消未支付账单 | `web/support/wallet/bill/api.ts:39` → `pageComponents/account/bill/BillTable.tsx:124` | 账户→账单→账单记录Tab→未支付账单→确认取消时调用 |
| `/proApi/support/wallet/bill/create` | POST | 创建支付账单 | `web/support/wallet/bill/api.ts:19` | （当前页面未直接使用，由其他模块调用） |
| `/proApi/support/wallet/bill/balanceConversion` | GET | 余额换算 | `web/support/wallet/bill/api.ts:36` | （当前页面未直接使用，由其他模块调用） |

## 发票管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/bill/invoice/unInvoiceList` | GET | 获取可开票账单列表 | `web/support/wallet/bill/invoice/api.ts:16` → `pageComponents/account/bill/ApplyInvoiceModal.tsx:60` | 账户→账单→点击「开发票」→弹窗打开→加载可开票账单列表时调用 |
| `/proApi/support/wallet/bill/invoice/submit` | POST | 提交发票申请 | `web/support/wallet/bill/invoice/api.ts:19` → `pageComponents/account/bill/ApplyInvoiceModal.tsx:75` | 账户→账单→开发票弹窗→填写抬头→点击确认提交时调用 |
| `/proApi/support/wallet/bill/invoice/records` | POST | 获取发票记录列表（分页） | `web/support/wallet/bill/invoice/api.ts:22` → `pageComponents/account/bill/InvoiceTable.tsx:37` | 账户→账单→发票Tab→加载/翻页时调用 |
| `/api/proApi/support/wallet/bill/invoice/downloadFile` | GET | 下载发票 PDF 文件 | `pageComponents/account/bill/InvoiceTable.tsx:143`（内联请求） | 账户→账单→发票Tab→点击详情→点击下载链接→下载发票 PDF 时调用 |

## 团队发票抬头

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/invoiceHeader/get`（推断路径） | GET | 获取团队发票抬头 | `web/support/user/team/api.ts:134` → `pageComponents/account/bill/InvoiceHeaderForm.tsx:212`、`pageComponents/account/bill/ApplyInvoiceModal.tsx:107` | 账户→账单→发票抬头Tab→加载时调用；账户→账单→开发票弹窗第二步→加载已有抬头时调用 |
| `/proApi/support/user/team/invoiceHeader/update`（推断路径） | — | 更新团队发票抬头 | `web/support/user/team/api.ts:137` → `pageComponents/account/bill/InvoiceHeaderForm.tsx:222` | 账户→账单→发票抬头Tab→填写/修改抬头→点击保存时调用 |

## API 分组

### 账单查询/操作（账单记录 Tab）

- `POST /proApi/support/wallet/bill/list` — 分页获取账单列表
- `GET /proApi/support/wallet/bill/detail` — 获取账单详情
- `GET /proApi/support/wallet/bill/pay/checkPayResult` — 检查支付结果
- `PUT /proApi/support/wallet/bill/pay/updatePayment` — 重新获取支付参数
- `POST /proApi/support/wallet/bill/cancel` — 取消账单

### 发票管理（发票 Tab + 开发票弹窗）

- `GET /proApi/support/wallet/bill/invoice/unInvoiceList` — 可开票账单列表
- `POST /proApi/support/wallet/bill/invoice/submit` — 提交发票申请
- `POST /proApi/support/wallet/bill/invoice/records` — 发票记录列表
- `GET /api/proApi/support/wallet/bill/invoice/downloadFile` — 下载发票文件

### 发票抬头（发票抬头 Tab）

- `GET .../invoiceHeader/get` — 获取团队发票抬头
- `POST/PUT .../invoiceHeader/update` — 更新团队发票抬头
