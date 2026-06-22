---
capability_label: "发票"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T11:20:00Z"
parent_module: "账单"
roles: ["团队管理员", "团队成员"]
router_paths: ["/account/bill?invoiceTab=invoice"]
---

# 发票 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/bill/invoice/records` | POST | 获取发票记录列表（分页） | `web/support/wallet/bill/invoice/api.ts:21` → `pageComponents/account/bill/InvoiceTable.tsx:31` | 账户→账单→发票记录Tab→加载时调用；发票记录→翻页时调用 |

## 文件下载

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/bill/invoice/downloadFile` | GET | 下载已完成的电子发票 PDF 文件 | `pageComponents/account/bill/InvoiceTable.tsx:143`（downloadFetch 内联调用） | 账户→账单→发票记录→详情弹窗→下载发票文件时调用 |

---

## API 调用链追踪

### `/proApi/support/wallet/bill/invoice/records` 调用链

```
InvoiceTable (pageComponents/account/bill/InvoiceTable.tsx)
  ├── 触发: 用户进入发票记录Tab 或 翻页操作
  ├── 参数: { pageNum: number, pageSize: number }（PaginationProps）
  ├── 响应处理:
  │     ├── usePagination 自动管理 data（InvoiceSchemaType[]）、total、pageSize
  │     ├── 列表渲染：invoices.map() 生成表格行
  │     └── 空数据处理：invoices.length === 0 时展示空状态提示
  └── 错误处理: usePagination 内部错误处理，无自定义错误逻辑
```

### `/proApi/support/wallet/bill/invoice/downloadFile` 调用链

```
InvoiceDetailModal (pageComponents/account/bill/InvoiceTable.tsx:133)
  ├── 触发: 用户点击"点击下载"链接
  ├── 条件: invoice.status === 2（已完成状态，有发票文件）
  ├── 参数: { id: string }（发票 _id，作为 URL query 参数）
  ├── 调用方式: downloadFetch 工具函数
  │     ├── url: /api/proApi/support/wallet/bill/invoice/downloadFile?id={id}
  │     ├── filename: {invoice.teamName}.pdf
  │     └── 方式: GET 请求，创建临时 <a> 标签触发下载
  └── 错误处理: useRequest 包裹，下载失败时通过 response.json() 解析错误信息并 reject
```
