---
capability_label: 登录
doc_type: "14"
doc_label: Store数据流
generated_at: 2026-06-18T10:40:00.000Z
parent_module: null
roles: []
router_paths: ["/login", "/login/fastlogin", "/login/provider"]
---

# 登录 — Store 数据流

> 登录模块本身不创建独立 Store，而是消费全局共享的 `useSystemStore` 和 `useUserStore`。

## Store 概览

| Store 文件 | Store ID | 用途 |
|-----------|---------|------|
| `src/web/common/system/useSystemStore.ts` | `useSystemStore` | 系统配置（OAuth 设置、登录方式）、登录中间态（loginStore） |
| `src/web/support/user/useUserStore.ts` | `useUserStore` | 用户信息、团队状态、登录成功后的状态写入 |

## useSystemStore（登录相关子集）

### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `loginStore` | `{ provider: OAuthEnum, lastRoute: string, state: string } \| undefined` | OAuth 登录中间态：记录发起登录的 provider、回跳路由、CSRF state |
| `feConfigs` | `FastGPTFeConfigsType` | 系统配置，含 OAuth provider 列表、注册/找回密码方式开关、登录方式配置 |
| `feConfigs.oauth` | `{ wechat?, google?, github?, microsoft?, wecom? }` | 启用的 OAuth 第三方登录 |
| `feConfigs.sso` | `{ url?, title?, icon?, autoLogin? }` | SSO 单点登录配置 |
| `feConfigs.register_method` | `string[]` | 允许的注册方式（email/phone） |
| `feConfigs.find_password_method` | `string[]` | 允许的找回密码方式 |

### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `setLoginStore` | `loginStore \| undefined` | 设置 OAuth 登录中间态，第三方跳转前保存 provider/state/lastRoute | 无 |
| `setLastRoute` | `route: string` | 记录用户最后访问路由，登录成功后回跳 | 无 |
| `initStaticData` | `InitDateResponse` | 初始化系统配置（含 OAuth、模型列表等），应用启动时调用 | 无（由 App 组件传入数据） |

## useUserStore（登录相关子集）

### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `userInfo` | `UserType \| null` | 用户完整信息，含团队、权限、语言偏好 |
| `isTeamAdmin` | `boolean` | 当前用户是否为团队管理员 |

### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `setUserInfo` | `user: UserType \| null` | 写入用户信息并同步语言偏好到 localStorage | 无 |
| `initUserInfo` | 无 | 应用初始化时通过 Token 自动登录 | `GET /support/user/account/tokenLogin` |

## 数据流向

### 密码登录流程

```
LoginForm                    useUserStore              API                     Backend
   │                             │                      │                        │
   │  getPreLogin(username)      │                      │                        │
   ├─────────────────────────────┼─────────────────────►│  GET /preLogin         │
   │                             │                      │◄─── {code} ────────────┤
   │                             │                      │                        │
   │  postLogin({user,pwd,code}) │                      │                        │
   ├─────────────────────────────┼─────────────────────►│  POST /loginByPassword │
   │                             │                      │◄─── LoginSuccessResp ──┤
   │                             │                      │                        │
   │  setUserInfo(res.user)      │                      │                        │
   ├────────────────────────────►│                      │                        │
   │                             │  state.userInfo=user │                        │
   │                             │  同步语言偏好         │                        │
   │  router.push(lastRoute)     │                      │                        │
```

### OAuth 登录流程

```
FormLayout                   useSystemStore           Provider Page             useUserStore
   │                             │                      │                        │
   │  setLoginStore({...})       │                      │                        │
   ├────────────────────────────►│                      │                        │
   │                             │  state.loginStore=X  │                        │
   │  router.replace(oauthUrl)   │                      │                        │
   │                             │                      │                        │
   │  [第三方授权完成后回调]       │                      │                        │
   │                             │                      │  clearToken()          │
   │                             │                      │  oauthLogin(params)    │
   │                             │                      │◄─── LoginSuccessResp ──┤
   │                             │                      │                        │
   │                             │                      │  setUserInfo(user)     │
   │                             │                      ├───────────────────────►│
   │                             │                      │                        │ state.userInfo=user
   │                             │                      │  setLoginStore(undef)  │
   │                             │                      │  router.replace(route) │
```

### 初始化 Token 登录流程

```
App.initUserInfo              useUserStore              API
   │                             │                      │
   │  initUserInfo()             │                      │
   ├────────────────────────────►│                      │
   │                             │  GET /tokenLogin     │
   │                             ├─────────────────────►│
   │                             │◄─── UserType ────────┤
   │                             │                      │
   │                             │  setUserInfo(user)   │
   │                             │  state.userInfo=user │
   │                             │  state.isTeamAdmin   │
   │                             │  语言偏好同步          │
   │◄────────────────────────────┤                      │
   │  [登录态有效，跳过登录页]     │                      │
```

## 组件间通信模式

| 通信模式 | 场景 | 涉及组件 |
|---------|------|---------|
| Store 共享状态（useSystemStore） | 读取系统配置控制 OAuth 按钮展示、登录方式切换 | LoginForm → FormLayout → WechatForm → RegisterForm |
| Store 共享状态（useSystemStore.loginStore） | OAuth 登录时保存中间态，provider 页读取并完成认证 | FormLayout（写） → provider.tsx（读） |
| Props 传递 | 父组件传递 `setPageType` 和 `loginSuccess` 给子表单 | Login(首页) → LoginForm/WechatForm/RegisterForm/ForgetPasswordForm |
| 路由参数 | 传递 `lastRoute`、`code`、`token` 等参数 | `/login?lastRoute=xxx` → `/login/fastlogin?code=xxx&token=xxx` |
| URL Query 参数 | 密码自动填充（?u=xxx&p=xxx） | URL → LoginForm.useMount |
