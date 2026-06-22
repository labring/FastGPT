---
capability_label: 账户
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:49:09Z"
parent_module: null
roles: [owner, admin, member]
router_paths: ["/account/usage", "/account/info", "/account/team", "/account/bill", "/account/thirdParty", "/account/customDomain", "/account/model", "/account/promotion", "/account/apikey", "/account/inform", "/account/setting"]
---

# 账户 — API索引

> 本文档汇总账户模块及其子能力调用的所有 API 接口，按功能分组。

## 账号信息

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/update` | POST | 更新用户信息（头像、时区、语言） | `pages/api/support/user/account/update.ts` → `pages/account/info/index.tsx` | 账户→账号信息→修改头像/时区/语言时调用 |
| `/support/user/account/checkPswExpired` | GET | 检查密码是否过期 | `pages/api/support/user/account/checkPswExpired.ts` | 账户→登录后全局检查→密码过期提醒 |

## 账号信息（管理员接口）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/adminGenerateToken` | POST | 管理员为用户生成登录 Token | `pages/api/support/user/account/adminGenerateToken.ts` | 管理员→代理用户登录→生成 Token 时调用（Root Key 鉴权） |
| `/support/user/account/adminGetUserTeams` | GET | 管理员查询用户的所有团队列表 | `pages/api/support/user/account/adminGetUserTeams.ts` | 管理员→查询用户团队→获取团队列表时调用（Root Key 鉴权） |

## 团队管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/team/list` | GET | 获取团队成员列表 | `web/support/user/team/api.ts` → `pages/account/team/index.tsx` | 账户→团队管理→加载时调用；搜索/分页时调用 |
| `/support/user/team/update` | PUT | 更新团队成员信息（角色、状态等） | `web/support/user/team/api.ts` → `pageComponents/account/team/` | 账户→团队管理→修改成员角色/状态时调用 |
| `/support/user/team/invite` | POST | 邀请成员加入团队 | `web/support/user/team/api.ts` → `pageComponents/account/team/` | 账户→团队管理→发送邀请时调用 |

## 第三方集成

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/team/thirtdParty/checkUsage` | GET | 检查第三方服务的用量配额 | `pages/api/support/user/team/thirtdParty/checkUsage.ts` → `pages/account/thirdParty/index.tsx` | 账户→第三方集成→加载工作流变量卡片时并行调用 |

## 自定义域名

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/customDomain/list` | GET | 获取自定义域名列表 | `web/support/customDomain/api.ts` → `pages/account/customDomain/index.tsx` | 账户→自定义域名→加载时调用 |
| `/support/customDomain/create` | POST | 创建自定义域名 | `web/support/customDomain/api.ts` → `pageComponents/account/customDomain/` | 账户→自定义域名→添加域名时调用 |
| `/support/customDomain/delete` | DELETE | 删除自定义域名 | `web/support/customDomain/api.ts` → `pages/account/customDomain/index.tsx` | 账户→自定义域名→删除域名时调用 |
| `/support/customDomain/checkDNSResolve` | POST | 检查 DNS 解析状态 | `web/support/customDomain/api.ts` → `pageComponents/account/customDomain/` | 账户→自定义域名→检查 DNS 配置时调用 |
| `/support/customDomain/active` | POST | 激活自定义域名 | `web/support/customDomain/api.ts` → `pageComponents/account/customDomain/` | 账户→自定义域名→激活域名时调用 |

## 账单与发票

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/bill/list` | POST | 获取账单列表 | `web/support/wallet/bill/api.ts` → `pages/account/bill/index.tsx` | 账户→账单→加载时调用；翻页时调用 |
| `/proApi/support/wallet/bill/detail` | GET | 获取账单详情 | `web/support/wallet/bill/api.ts` → `pageComponents/account/bill/BillDetailModal.tsx` | 账户→账单→点击查看账单详情时调用 |
| `/proApi/support/wallet/bill/invoice/unInvoiceList` | GET | 获取可开发票的账单列表 | `web/support/wallet/bill/invoice/api.ts` → `pages/account/bill/` | 账户→账单→打开发票管理时调用 |
| `/proApi/support/wallet/bill/invoice/submit` | POST | 提交发票申请 | `web/support/wallet/bill/invoice/api.ts` → `pages/account/bill/` | 账户→账单→提交发票申请时调用 |
| `/proApi/support/wallet/bill/invoice/records` | POST | 获取发票记录列表 | `web/support/wallet/bill/invoice/api.ts` → `pages/account/bill/` | 账户→账单→查看发票历史时调用 |

## 用量统计

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/wallet/usage/list` | POST | 获取用量明细列表 | `web/support/wallet/usage/api.ts` → `pageComponents/account/usage/UsageTableList.tsx` | 账户→用量统计→明细视图→加载/筛选/翻页时调用 |
| `/proApi/support/wallet/usage/dashboard` | POST | 获取用量仪表盘数据 | `web/support/wallet/usage/api.ts` → `pageComponents/account/usage/Dashboard.tsx` | 账户→用量统计→仪表盘视图→加载/筛选时调用 |

## API 密钥

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/openapi/list` | GET | 获取 API 密钥列表 | `web/support/openapi/api.ts:20` → `components/support/apikey/Table.tsx` | 账户→API 密钥→加载时调用 |
| `/support/openapi/create` | POST | 创建 API 密钥 | `web/support/openapi/api.ts:8` → `components/support/apikey/Table.tsx` | 账户→API 密钥→新建密钥时调用 |
| `/support/openapi/update` | PUT | 更新 API 密钥 | `web/support/openapi/api.ts:14` → `components/support/apikey/Table.tsx` | 账户→API 密钥→编辑密钥时调用 |
| `/support/openapi/delete` | DELETE | 删除 API 密钥 | `web/support/openapi/api.ts` → `components/support/apikey/Table.tsx` | 账户→API 密钥→删除密钥时调用 |

## 推广

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/activity/promotion/records` | GET | 获取推广记录列表 | `web/support/activity/promotion/api.ts` → `pages/account/promotion.tsx` | 账户→推广→加载时调用；翻页时调用 |
| `/support/activity/promotion/initData` | GET | 获取推广统计数据 | `web/support/activity/promotion/api.ts` → `pages/account/promotion.tsx` | 账户→推广→加载时调用 |

## 模型管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/ai/model/list` | GET | 获取模型列表 | `web/core/ai/model.ts` → `components/core/ai/ModelTable/` | 账户→模型管理→加载模型列表时调用 |
| `/core/ai/model/create` | POST | 创建/启用模型 | `web/core/ai/model.ts` → `components/core/ai/ModelTable/` | 账户→模型管理→添加模型时调用 |
| `/core/ai/model/update` | PUT | 更新模型配置 | `web/core/ai/model.ts` → `components/core/ai/ModelTable/` | 账户→模型管理→编辑模型时调用 |
| `/core/ai/model/delete` | DELETE | 删除模型 | `web/core/ai/model.ts` → `components/core/ai/ModelTable/` | 账户→模型管理→删除模型时调用 |

## 文件上传

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/common/file/uploadAvatarPresignedUrl` | GET | 获取头像上传预签名 URL | `web/common/file/api.ts` → `pages/account/info/index.tsx` | 账户→账号信息→修改头像时调用 |

## API 调用链追踪

### `/support/user/account/update` 调用链

```
pages/account/info/index.tsx (MyInfo 子组件)
  ├── 触发: 用户修改头像/时区/语言后自动保存
  ├── 参数: { avatar, timezone, language }
  └── 响应处理: 更新 team member avatar 记录 + 刷新 S3 avatar 缓存
```

### `/support/user/team/thirtdParty/checkUsage` 调用链

```
pages/account/thirdParty/index.tsx (ThirdParty 页面)
  ├── 触发: 页面加载时对每个 externalProviderWorkflowVariable 并行调用
  ├── 参数: { key: item.key }
  └── 响应处理: 合并到 accountList 中展示用量进度条
```

### `/proApi/support/wallet/usage/list` 调用链

```
pageComponents/account/usage/UsageTableList.tsx
  ├── 触发: 用量明细视图加载/筛选条件变化/翻页
  ├── 参数: { dateRange, memberFilter, usageSources, projectName, unit, page, pageSize }
  └── 响应处理: 渲染用量明细表格，更新分页控件
```

### `/support/openapi/list` 调用链

```
components/support/apikey/Table.tsx (ApiKeyTable)
  ├── 触发: 页面加载 / 新建-编辑-删除操作后刷新
  ├── 参数: { appId? }
  └── 响应处理: 渲染 API 密钥列表表格
```

> 各子能力的完整 API 调用链详解见对应子目录的 `API索引.md`。
