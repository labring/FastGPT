---
capability_label: 自定义域名
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles:
  - 团队所有者
router_paths:
  - /account/customDomain
---
# 自定义域名 — API索引

> 本文档建立 API 到业务场景的反向索引。所有 API 通过 `/proApi/support/customDomain/*` 代理到 FastGPT Pro 商业版后端。

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/customDomain/list` | GET | 获取团队所有自定义域名列表 | `web/support/customDomain/api.ts:7` → `pages/account/customDomain/index.tsx:48` | 自定义域名→查看列表→页面加载时调用；自定义域名→添加→创建成功后刷新；自定义域名→编辑→激活成功后刷新；自定义域名→删除→删除成功后刷新 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/customDomain/create` | POST | 创建新的自定义域名绑定 | `web/support/customDomain/api.ts:20` → `pageComponents/account/customDomain/createModal.tsx:137` | 自定义域名→添加域名→DNS解析成功后确认创建时调用 |

**请求参数**：`domain`（自定义域名）、`provider`（DNS 提供商枚举）、`cnameDomain`（CNAME 目标域名）

## 激活

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/customDomain/active` | POST | 激活已有的自定义域名（refresh 模式） | `web/support/customDomain/api.ts:23` → `pageComponents/account/customDomain/createModal.tsx:131` | 自定义域名→编辑/激活→DNS解析成功后确认激活时调用 |

**请求参数**：`domain`（要激活的域名）

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/customDomain/delete` | DELETE | 删除自定义域名绑定 | `web/support/customDomain/api.ts:15` → `pages/account/customDomain/index.tsx:63` | 自定义域名→删除域名→确认弹窗中确认删除时调用 |

**请求参数**：`domain`（要删除的域名）

## 配置/检测

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/customDomain/checkDNSResolve` | POST | 检测 DNS CNAME 记录是否已解析 | `web/support/customDomain/api.ts:9` → `pageComponents/account/customDomain/createModal.tsx:120` | 自定义域名→添加域名→保存后每5秒自动轮询调用；自定义域名→编辑/激活→手动刷新时调用 |

**请求参数**：`domain`（自定义域名）、`cnameDomain`（CNAME 目标域名）

## 文件验证（未启用）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/customDomain/updateVerifyFile` | POST | 更新域名验证文件 | `web/support/customDomain/api.ts:30` → `pageComponents/account/customDomain/domainVerifyModal.tsx:21` | 当前未启用（domainVerifyModal 组件在主页面中被注释掉，未渲染） |

**请求参数**：`domain`（域名）、`path`（验证文件路径）、`content`（验证文件内容）

---

## API 调用链追踪

### `/proApi/support/customDomain/list` 调用链

```
pages/account/customDomain/index.tsx (CustomDomain 组件)
  ├── 触发: 组件挂载时自动调用（manual: false）
  ├── 参数: 无
  ├── 响应处理: 设置 customDomainList 状态 → 渲染表格
  └── 刷新触发: 创建/删除/激活成功后手动调用 refreshAsync()

pageComponents/app/detail/Publish/Wecom/index.tsx (Wecom 组件)
  ├── 触发: 发布到企业微信时获取可选域名列表
  └── 响应处理: 用于企业微信发布的自定义域名选择

pageComponents/app/detail/Publish/components/showShareLinkModal.tsx (ShareLinkContainer)
  ├── 触发: 显示分享链接时获取可选自定义域名
  └── 响应处理: 用于生成带自定义域名的分享链接
```

### `/proApi/support/customDomain/checkDNSResolve` 调用链

```
pageComponents/account/customDomain/createModal.tsx
  ├── 触发: add 模式下用户保存域名后开始自动轮询（每5秒）
  ├── 参数: { domain: 用户输入的域名, cnameDomain: 系统生成的CNAME }
  ├── 响应处理: success=true → 显示绿色"已解析"标签，启用确认按钮
  └── 触发: refresh 模式下用户点击"刷新"按钮手动触发

```

### `/proApi/support/customDomain/create` 调用链

```
pageComponents/account/customDomain/createModal.tsx
  ├── 触发: 用户点击"确认"按钮（add 模式）
  ├── 参数: { domain, provider, cnameDomain }
  ├── 前置条件: DNS 已解析成功（DnsResolved=true）
  └── 响应处理: 成功后关闭弹窗

```

### `/proApi/support/customDomain/active` 调用链

```
pageComponents/account/customDomain/createModal.tsx
  ├── 触发: 用户点击"确认"按钮（refresh 模式）
  ├── 参数: { domain }
  ├── 前置条件: DNS 已解析成功（DnsResolved=true）
  └── 响应处理: 成功后关闭弹窗

```

### `/proApi/support/customDomain/delete` 调用链

```
pages/account/customDomain/index.tsx (CustomDomain 组件)
  ├── 触发: 用户在确认删除弹窗中点击确认
  ├── 参数: domain 字符串
  └── 响应处理: 成功后自动刷新域名列表

```
