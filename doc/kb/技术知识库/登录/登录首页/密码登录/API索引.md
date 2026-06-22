---
capability_label: 密码登录
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:55:00.000Z"
parent_module: 登录首页
roles: []
router_paths: ["/login"]
---

# 密码登录 — API索引

## 认证

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/preLogin` | GET | 获取预登录验证码 | `projects/app/src/web/support/user/api.ts:34` → `projects/app/src/pageComponents/login/LoginForm/LoginForm.tsx:45` | 登录→密码登录→提交登录时调用（在 postLogin 之前，串行依赖其返回的 code） |
| `/support/user/account/loginByPassword` | POST | 密码登录 | `projects/app/src/web/support/user/api.ts:45` → `projects/app/src/pageComponents/login/LoginForm/LoginForm.tsx:47` | 登录→密码登录→提交登录时调用（在 getPreLogin 之后）；登录→密码登录→URL 自动登录时调用 |

> **注意**：`postLogin` 在前端将密码经 `hashStr()` 哈希后再发送，不再传输明文密码。

## API 调用链追踪

### `GET /support/user/account/preLogin` 调用链

```
LoginForm.tsx 的 onclickLogin
  ├── 触发: 用户点击登录按钮 / 按 Enter / URL 自动登录
  ├── 参数: { username: 用户输入的用户名 }
  └── 响应处理: 解构 { code }，作为 postLogin 的参数传入
```

### `POST /support/user/account/loginByPassword` 调用链

```
LoginForm.tsx 的 onclickLogin
  ├── 触发: getPreLogin 成功后自动调用（串行）
  ├── 参数: { username, password: hashStr(password), code: preLogin返回的code, language, teamId? }
  ├── 响应处理: 调用 loginSuccess(res)，写入 user 信息并跳转
  └── 错误处理:
      ├── 密码错误 (statusText === UserErrEnum.account_psw_error): router.replace 清除 URL 中的 u/p 参数
      └── 其他错误: 由 useRequest 的 onError 统一 toast 提示
```
