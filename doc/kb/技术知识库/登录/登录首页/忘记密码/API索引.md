---
capability_label: 忘记密码
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:51:08.000Z
parent_module: 登录首页
roles: []
router_paths: ["/login"]
---

# 忘记密码 — API索引

## 密码重置

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/password/updateByCode` | POST | 通过验证码重置密码 | `projects/app/src/web/support/user/api.ts:79` → `projects/app/src/pageComponents/login/ForgetPasswordForm.tsx:59` | 登录→忘记密码→点击"找回密码"提交时调用 |

## 验证码

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/inform/sendAuthCode` | POST | 发送邮箱/手机验证码 | `projects/app/src/web/support/user/api.ts:21` → `projects/app/src/web/support/user/hooks/useSendCode.tsx:24` → `projects/app/src/pageComponents/login/ForgetPasswordForm.tsx:41` | 登录→忘记密码→点击"获取验证码"时调用（通过 useSendCode hook） |

---

## `/proApi/support/user/account/password/updateByCode` 调用链

```
ForgetPasswordForm (projects/app/src/pageComponents/login/ForgetPasswordForm.tsx:57-72)
  ├── 触发: 用户填写账号+验证码+新密码+确认密码后，点击"找回密码"按钮提交
  ├── 参数: { username: string, code: string, password: string }
  │   └── password 经 hashStr() 加密后传输
  ├── 校验:
  │   ├── 前端: react-hook-form 校验账号格式、验证码非空、密码规则、两次密码一致
  │   └── 后端: 校验验证码有效性和账号存在性
  ├── 响应: 返回 LoginSuccessResponseType（登录凭证），前端自动登录
  └── 成功后: toast 提示"密码已找回" → 自动登录跳转系统
```

## `/proApi/support/user/inform/sendAuthCode` 调用链（验证码发送）

```
ForgetPasswordForm → useSendCode hook (projects/app/src/web/support/user/hooks/useSendCode.tsx:14-112)
  ├── 触发: 用户在忘记密码表单的账号输入框右侧点击"获取验证码"
  ├── 参数: { username: string, type: "findPassword", googleToken: string, captcha: string, lang: string }
  │   ├── googleToken: 通过 Google reCAPTCHA 获取的人机验证 token
  │   ├── captcha: 图形验证码（如有）
  │   └── lang: 当前语言
  ├── 前置条件:
  │   ├── 账号不能为空（为空时 toast 提示"请输入账号"）
  │   ├── 当前不在倒计时中（codeCountDown > 0 时不可发送）
  │   └── 系统配置 googleClientVerKey 时：弹出 SendCodeAuthModal 人机验证弹窗
  ├── 成功后: toast 提示"验证码已发送"，按钮进入 60s 倒计时
  └── 失败后: toast 提示"验证码发送失败"及具体错误信息
```
