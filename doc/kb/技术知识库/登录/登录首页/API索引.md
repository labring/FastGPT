---
capability_label: 登录首页
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:50:00.000Z
parent_module: 登录
roles: [未登录用户]
router_paths: [/login]
---

# 登录首页 — API索引

## 查询/检测类

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `https://qifu-api.baidubce.com/ip/local/geo/v1/district` | GET | IP 归属地检测 | `projects/app/src/pages/login/index.tsx` → RedirectDrawer | 登录首页→页面初始化→加载时自动调用 |

## 配置/选项类

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/getAuthURL` | POST | 获取 SSO 授权跳转 URL | `projects/app/src/pageComponents/login/LoginForm/FormLayout.tsx` | 登录首页→OAuth 登录→点击 SSO 按钮时调用 |

## OAuth/第三方登录

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/wecom/getRedirectUrl` | POST | 获取企业微信授权跳转 URL | `projects/app/src/pageComponents/login/LoginForm/FormLayout.tsx` | 登录首页→OAuth 登录→点击企业微信按钮时调用 |

## 说明

本模块（登录首页公共层）主要负责页面布局、OAuth 入口和辅助功能，API 调用较少。核心的登录/注册/密码相关 API 见各 Tab 子能力的 API 索引：

- 密码登录 API → [密码登录/API索引](../登录首页/密码登录/API索引.md)
- 注册 API → [注册/API索引](../登录首页/注册/API索引.md)
- 忘记密码 API → [忘记密码/API索引](../登录首页/忘记密码/API索引.md)
- 微信登录 API → [微信登录/API索引](../登录首页/微信登录/API索引.md)

## API 调用链追踪

### `https://qifu-api.baidubce.com/ip/local/geo/v1/district` 调用链

```
登录首页 (index.tsx)
  ├── 触发: 页面加载时 useMount 自动触发
  ├── 参数: 无
  └── 响应处理: 检查 res.country === '中国' 且 prov 非港澳台 → 弹出重定向抽屉；失败时 console.log 错误

FormLayout (FormLayout.tsx)
  ├── 触发: 用户点击 OAuth 按钮
  ├── 参数: redirectUri, isWecomWorkTerminal（企业微信场景）, state（SSO 场景）
  └── 响应处理: 存储登录上下文到 useSystemStore → 跳转到授权 URL
```

### `/proApi/support/user/account/login/getAuthURL` 调用链

```
FormLayout → onClickOauth
  ├── 触发: 用户点击 SSO 按钮
  ├── 参数: { redirectUri, isWecomWorkTerminal }
  └── 响应处理: setLoginStore({ provider, lastRoute, state }) → router.replace(redirectUrl)

FormLayout → onClickOauth (企业微信分支)
  ├── 触发: 用户点击企业微信按钮
  ├── 参数: { redirectUri, isWecomWorkTerminal, state }
  └── 响应处理: setLoginStore({ provider, lastRoute, state }) → router.replace(redirectUrl)
```
