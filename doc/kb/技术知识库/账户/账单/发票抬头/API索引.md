---
capability_label: "发票抬头"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T11:30:00.000Z"
parent_module: "账单"
roles: ["admin"]
router_paths: ["/account/bill"]
---

# 发票抬头 — API索引

## 查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/invoiceAccount/getTeamInvoiceHeader` | GET | 获取团队默认发票抬头信息 | `projects/app/src/web/support/user/team/api.ts:134` → `projects/app/src/pageComponents/account/bill/InvoiceHeaderForm.tsx:212`<br>`projects/app/src/web/support/user/team/api.ts:134` → `projects/app/src/pageComponents/account/bill/ApplyInvoiceModal.tsx:107` | 账户→账单→发票抬头Tab→页面加载时调用；账户→账单→申请发票弹窗→打开结算页时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/invoiceAccount/update` | POST | 更新团队发票抬头信息 | `projects/app/src/web/support/user/team/api.ts:137` → `projects/app/src/pageComponents/account/bill/InvoiceHeaderForm.tsx:223` | 账户→账单→发票抬头Tab→编辑表单后点击「保存」按钮时调用 |

## API 调用链追踪

### `/proApi/support/user/team/invoiceAccount/getTeamInvoiceHeader` 调用链

```
InvoiceHeaderForm 组件
  ├── 触发: 页面挂载时自动调用（manual: false）
  ├── 参数: 无（后端从当前团队上下文获取 teamId）
  └── 响应处理: 成功 → inputForm.reset(data) 填充表单所有字段；失败 → 由 useRequest 内置的错误 toast 处理

ApplyInvoiceModal 组件
  ├── 触发: 弹窗打开结算页面时自动调用（manual: false）
  ├── 参数: 无
  └── 响应处理: 成功 → inputForm.reset(res) 填充发票抬头表单；失败 → 由 useRequest 内置错误 toast 处理
```

### `/proApi/support/user/team/invoiceAccount/update` 调用链

```
InvoiceHeaderForm 组件
  ├── 触发: 用户填写表单后点击「保存」按钮，通过 handleSubmit 触发
  ├── 参数: {
  │   teamName: string,           // 组织名称
  │   unifiedCreditCode: string,  // 统一社会信用代码
  │   companyAddress: string,     // 公司地址
  │   companyPhone: string,       // 公司电话
  │   bankName: string,           // 银行名称
  │   bankAccount: string,        // 银行账号
  │   needSpecialInvoice: boolean,// 是否需要专票
  │   contactPhone: string,       // 联系电话
  │   emailAddress: string        // 邮箱地址
  │ }
  └── 响应处理: 成功 → 显示「保存成功」toast；失败 → 显示「保存异常」toast，表单数据保持不丢失
```
