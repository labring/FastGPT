---
capability_label: "注册"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:52:14Z"
parent_module: "登录首页"
roles: ["visitor"]
router_paths: ["/login"]
---

# 注册 — API索引

## 说明

本模块（注册 Tab）不包含独立的 API 定义文件，所有 API 调用通过共享 API 层 `@/web/support/user/api.ts` 发起。以下列出注册流程中调用的 API。

---

## 注册类

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/register/emailAndPhone` | POST | 提交注册请求 | `projects/app/src/web/support/user/api.ts:59`（`postRegister`） → `projects/app/src/pageComponents/login/RegisterForm.tsx:55` | 登录→注册 Tab→填写完所有字段→点击"确认注册"或按 Enter 时调用 |
| `/proApi/support/user/inform/sendAuthCode` | POST | 发送邮箱/手机验证码 | `projects/app/src/web/support/user/api.ts:21`（`sendAuthCode`） → `projects/app/src/web/support/user/hooks/useSendCode.tsx:24` → `projects/app/src/pageComponents/login/RegisterForm.tsx:50` | 登录→注册 Tab→输入用户名→点击"获取验证码"→完成图形验证后调用 |
| `/proApi/support/user/account/captcha/getImgCaptcha` | GET | 获取图形验证码图片 | `projects/app/src/web/support/user/api.ts:28`（`getCaptchaPic`） → `projects/app/src/components/support/user/safe/SendCodeAuthModal.tsx` → `projects/app/src/pageComponents/login/RegisterForm.tsx:50` | 登录→注册 Tab→点击"获取验证码"→弹出验证码弹窗时调用（由 SendCodeAuthModal 内部触发） |

---

## API 调用链追踪

### `POST /proApi/support/user/account/register/emailAndPhone` 调用链

```
RegisterForm (projects/app/src/pageComponents/login/RegisterForm.tsx)
  ├── 触发: 用户点击"确认注册"按钮或按 Enter 键
  ├── 参数:
  │   ├── username: 用户输入的邮箱或手机号
  │   ├── code: 验证码（8 位）
  │   ├── password: 密码（经 hashStr 哈希处理）
  │   ├── inviterId: 邀请人 ID（来自 cookie/localStorage）
  │   ├── bd_vid: 百度推广 VID
  │   ├── msclkid: 微软广告 Click ID
  │   ├── fastgpt_sem: FastGPT 语义标记
  │   └── sourceDomain: 来源域名
  ├── 前置: react-hook-form 全部字段校验通过（用户名格式、验证码非空、密码规则、两次密码一致）
  ├── 响应处理:
  │   ├── 成功: loginSuccess(res) → 自动登录并跳转首页 + Toast "注册成功"
  │   ├── 失败: useRequest onError 处理 → 显示错误 Toast
  │   └── 后置: removeFastGPTSem() 清除营销标记
  └── 请求状态: requesting（boolean）→ 按钮 isLoading 动画
```

### `POST /proApi/support/user/inform/sendAuthCode` 调用链

```
useSendCode (projects/app/src/web/support/user/hooks/useSendCode.tsx)
  ├── 触发: 用户在 SendCodeAuthModal 中完成验证后确认发送
  ├── 参数:
  │   ├── username: 目标邮箱或手机号
  │   ├── type: "register"（固定值，表示注册场景）
  │   ├── googleToken: Google reCAPTCHA token（如配置了 Google 验证）
  │   ├── captcha: 图形验证码输入
  │   └── lang: 当前语言
  ├── 前置: 60s 冷却计时未激活（codeCountDown <= 0）+ 用户名非空
  ├── 响应处理:
  │   ├── 成功: Toast "验证码已发送" + 启动 60s 倒计时
  │   └── 失败: Toast "验证码发送失败"
  └── 状态: codeSending（loading）+ codeCountDown（倒计时数值）
```
