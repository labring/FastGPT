---
capability_label: 登录
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:40:00.000Z
parent_module: null
roles: []
router_paths: ["/login", "/login/fastlogin", "/login/provider"]
---

# 登录 — API索引

## 查询/预检

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/preLogin` | GET | 获取登录预检码（code） | `src/web/support/user/api.ts:34` → `src/pageComponents/login/LoginForm/LoginForm.tsx:45` | 登录→密码登录→提交登录前调用 |
| `/support/user/account/checkPswExpired` | GET | 检查密码是否已过期 | `src/web/support/user/api.ts:103` | 登录→登录前检查 |

## 登录认证

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/loginByPassword` | POST | 密码登录 | `src/web/support/user/api.ts:45` → `src/pageComponents/login/LoginForm/LoginForm.tsx:47` | 登录→密码登录→提交用户名密码时调用 |
| `/proApi/support/user/account/login/oauth` | POST | OAuth 第三方登录 | `src/web/support/user/api.ts:39` → `src/pages/login/provider.tsx:72` | 登录→第三方登录→OAuth 回调后调用 |
| `/proApi/support/user/account/login/fastLogin` | POST | 快速登录 | `src/web/support/user/api.ts:41` → `src/pages/login/fastlogin.tsx:41` | 登录→快速登录→携带 code+token 访问时调用 |
| `/support/user/account/tokenLogin` | GET | Token 自动登录 | `src/web/support/user/api.ts:37` → `src/web/support/user/useUserStore.ts:54` | 应用初始化→检查已有登录态时调用 |
| `/proApi/support/user/account/sso` | GET | SSO 单点登录 | `src/web/support/user/api.ts:43` | 登录→SSO 认证 |

## 微信登录

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/wx/getQR` | GET | 获取微信登录二维码 | `src/web/support/user/api.ts:51` → `src/pageComponents/login/LoginForm/WechatForm.tsx:34` | 登录→微信扫码登录→加载二维码时调用 |
| `/proApi/support/user/account/login/wx/getResult` | POST | 轮询微信扫码结果 | `src/web/support/user/api.ts:54` → `src/pageComponents/login/LoginForm/WechatForm.tsx:46` | 登录→微信扫码登录→每3秒轮询扫码状态时调用 |

## OAuth 前置

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/getAuthURL` | POST | 获取 SSO 授权跳转 URL | `src/web/support/user/api.ts` → `src/pageComponents/login/LoginForm/FormLayout.tsx:127` | 登录→OAuth 列表→点击 SSO 按钮时调用 |
| `/proApi/support/user/account/login/wecom/getRedirectUrl` | POST | 获取企业微信授权跳转 URL | `src/web/support/user/api.ts` → `src/pageComponents/login/LoginForm/FormLayout.tsx:141` | 登录→企业微信终端→自动跳转时调用 |

## 账号管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/register/emailAndPhone` | POST | 邮箱/手机号注册 | `src/web/support/user/api.ts:59` | 登录→注册→提交注册表单时调用 |
| `/proApi/support/user/account/password/updateByCode` | POST | 通过验证码重置密码 | `src/web/support/user/api.ts:80` | 登录→忘记密码→提交新密码时调用 |
| `/proApi/support/user/inform/sendAuthCode` | POST | 发送验证码（注册/找回密码） | `src/web/support/user/api.ts:21` | 登录→注册/忘记密码→获取验证码时调用 |
| `/proApi/support/user/account/captcha/getImgCaptcha` | GET | 获取图形验证码 | `src/web/support/user/api.ts:28` | 登录→注册→需要验证码时调用 |

## 登出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/loginout` | GET | 退出登录 | `src/web/support/user/api.ts:56` → `src/web/support/user/auth.ts:33` | 登录→页面初始化→清除登录态时调用 |

---

## API 调用链追踪

### `/support/user/account/loginByPassword` 调用链

```
LoginForm (src/pageComponents/login/LoginForm/LoginForm.tsx)
  ├── 触发: 用户填写用户名密码，点击"登录"按钮或按 Enter
  ├── 参数: { username, password(hashStr), code(来自 getPreLogin), language, teamId }
  ├── 前置: getPreLogin(username) → GET /support/user/account/preLogin 获取 code
  └── 响应处理: 成功后调用 loginSuccess(res) → setUserInfo + router.push(lastRoute)

LoginForm (URL 参数自动登录)
  ├── 触发: URL 携带 ?u=xxx&p=xxx 参数时，页面挂载后自动调用
  ├── 参数: { username: query.u, password: query.p }
  └── 响应处理: 同手动登录
```

### `/proApi/support/user/account/login/oauth` 调用链

```
provider (src/pages/login/provider.tsx)
  ├── 触发: 第三方平台授权后回调 /login/provider?code=xxx&state=xxx
  ├── 前置: 校验 state 防止 CSRF 攻击，清除旧 Token
  ├── 参数: { type: loginStore.provider, props(回调 query params), callbackUrl, inviterId, bd_vid, msclkid, fastgpt_sem, sourceDomain, language }
  └── 响应处理: 成功后调用 loginSuccess → setUserInfo + router.replace(lastRoute)；失败提示错误并返回登录页
```

### `/proApi/support/user/account/login/fastLogin` 调用链

```
FastLogin (src/pages/login/fastlogin.tsx)
  ├── 触发: 页面挂载后自动调用 authCode(code, token)
  ├── 前置: 清除 Token，校验回调 URL 安全性
  ├── 参数: { code, token }
  └── 响应处理: 成功后 setUserInfo + router.push(callbackUrl)；失败提示错误并返回 /login
```

### `/support/user/account/tokenLogin` 调用链

```
useUserStore.initUserInfo (src/web/support/user/useUserStore.ts)
  ├── 触发: 应用初始化时自动调用
  ├── 参数: 无（通过 Cookie/Header 传递认证信息）
  └── 响应处理: 成功后 setUserInfo + 设置语言偏好；失败静默处理（用户需手动登录）
```

### `/support/user/account/loginout` 调用链

```
clearToken (src/web/support/user/auth.ts)
  ├── 触发: 登录页初始化（/login、/login/fastlogin、/login/provider）、用户主动退出
  ├── 前置: clearAdStorage() 清除 localStorage 中以 "logout-" 开头的键
  └── 响应处理: 无特殊处理，调用 API 后即完成
```
