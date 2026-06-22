---
capability_label: "第三方集成"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: "账户"
roles: ["owner", "member"]
router_paths: ["/account/thirdParty"]
---

# 账户 — 第三方集成 API 索引

## 查询/检测

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/team/thirtdParty/checkUsage` | GET | 查询第三方工作流变量提供商的使用量 | `projects/app/src/pages/api/support/user/team/thirtdParty/checkUsage.ts:20` → `projects/app/src/pages/account/thirdParty/index.tsx:88` | 账户→第三方集成→页面加载时调用（对每个工作流变量提供商并行请求）；外部变量配置变化后刷新时调用 |

## 配置更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/team/update` | PUT | 更新团队第三方配置 | `projects/app/src/web/support/user/team/api.ts:36` → `projects/app/src/components/support/laf/LafAccountModal.tsx:88` | 账户→第三方集成→配置 Laf 账号→提交保存时调用 |
|  |  |  | `projects/app/src/web/support/user/team/api.ts:36` → `projects/app/src/pageComponents/account/thirdParty/OpenAIAccountModal.tsx:27` | 账户→第三方集成→配置 OpenAI 账号→提交保存时调用 |
|  |  |  | `projects/app/src/web/support/user/team/api.ts:36` → `projects/app/src/pageComponents/account/thirdParty/WorkflowVariableModal.tsx:32` | 账户→第三方集成→配置工作流变量→提交保存时调用 |

## API 调用链追踪

### `GET /support/user/team/thirtdParty/checkUsage` 调用链

```
ThirdParty (页面组件)
  ├── 触发: 页面加载及 refreshDeps 变化时自动请求
  ├── 参数: { key: string } — 外部工作流变量提供商的唯一标识
  ├── 串行/并行: 对每个 workfow variable provider 并行请求（Promise.all）
  └── 响应处理: 成功返回 { total, used } → 合并到卡片数据用于渲染进度条；失败或返回 undefined → usage 字段为空，进度条不渲染
```

### `PUT /support/user/team/update` 调用链

```
LafAccountModal
  ├── 触发: 管理员选择 Laf 应用后点击"更新"
  ├── 参数: { lafAccount: { token, appid, pat } }
  ├── 串行/并行: 独立请求，无前后依赖
  └── 响应处理: 成功 → initUserInfo() 刷新全局用户信息 → 关闭弹窗；失败 → toast "更新失败"

OpenAIAccountModal
  ├── 触发: 管理员填写 API Key/BaseUrl 后点击"确认"
  ├── 参数: { openaiAccount: { key, baseUrl } }
  ├── 串行/并行: 独立请求，无前后依赖
  └── 响应处理: 成功 → initUserInfo() 刷新全局用户信息 → 关闭弹窗；失败 → toast "更新失败"

WorkflowVariableModal
  ├── 触发: 管理员填写参数值后点击"确认"
  ├── 参数: { externalWorkflowVariable: { key, value } }
  ├── 串行/并行: 独立请求，无前后依赖
  └── 响应处理: 成功 → initUserInfo() 刷新全局用户信息 → 关闭弹窗；失败 → toast "更新失败"
```
