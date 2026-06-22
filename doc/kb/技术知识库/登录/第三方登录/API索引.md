---
capability_label: 第三方登录
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:49:00Z"
parent_module: 登录
roles: []
router_paths:
  - /login/provider
---

# 第三方登录 — API 索引

## OAuth 登录

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/oauth` | POST | OAuth 第三方登录 | `projects/app/src/web/support/user/api.ts:39` → `projects/app/src/pages/login/provider.tsx:72` | 登录→第三方登录回调→页面加载时调用，提交授权码完成登录 |
| `/proApi/support/user/account/login/getAuthURL` | POST | 获取 SSO 认证跳转地址 | `projects/app/src/pageComponents/login/LoginForm/FormLayout.tsx:127` → FormLayout 组件 | 登录→登录页→点击 SSO 登录按钮时调用，获取认证重定向 URL |
| `/proApi/support/user/account/login/wecom/getRedirectUrl` | POST | 获取企业微信认证跳转地址 | `projects/app/src/pageComponents/login/LoginForm/FormLayout.tsx:141` → FormLayout 组件 | 登录→登录页→点击企业微信登录按钮时调用，获取认证重定向 URL |

## 登出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/loginout` | GET | 退出登录并清除服务端会话 | `projects/app/src/web/support/user/api.ts:56` → `projects/app/src/web/support/user/auth.ts:33` | 登录→第三方登录回调→页面加载时首先调用，清除旧令牌 |

## 团队邀请

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/team/invitationLink/accept` | POST | 接受团队邀请链接 | `projects/app/src/web/support/user/team/api.ts:79` → `projects/app/src/pages/login/provider.tsx:51` | 登录→第三方登录回调→登录成功后（团队状态非 active 且 lastRoute 含有邀请链接时）调用 |

---

## API 调用链追踪

### `POST /proApi/support/user/account/login/oauth` 调用链

```
provider.tsx (authProps 函数)
  ├── 触发: 页面加载后，state 校验通过，清除旧令牌完成
  ├── 参数: type(provider类型), props(OAuth回调参数), callbackUrl(本页URL),
  │         inviterId, bd_vid, msclkid, fastgpt_sem, sourceDomain, language
  └── 响应处理:
        ├── 成功(有 res): 调用 loginSuccess(res) → setUserInfo + 检查团队状态 + 路由跳转
        └── 失败(无 res/异常): 显示错误 Toast，1秒后跳转错误页(errorRedirectPage)
```

### `GET /support/user/account/loginout` 调用链

```
provider.tsx (useEffect)
  └── 触发: 页面加载且 initd 为 true 时
      └── 包装在 retryFn 中，最多重试 2 次
      └── 成功后继续执行 authProps(props)
```

### `POST /proApi/support/user/team/invitationLink/accept` 调用链

```
provider.tsx (loginSuccess 函数)
  ├── 触发: OAuth 登录成功后，user.team.status !== 'active' 且 lastRoute 包含邀请链接ID
  ├── 参数: linkId (从 lastRoute URL 的 invitelinkid 参数中提取)
  └── 响应处理: 成功后导航到 /dashboard/agent
```
