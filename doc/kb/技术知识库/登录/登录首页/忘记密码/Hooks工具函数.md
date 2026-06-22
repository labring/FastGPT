---
capability_label: 忘记密码
doc_type: "16"
doc_label: Hooks工具函数
generated_at: 2026-06-18T10:51:08.000Z
parent_module: 登录首页
roles: []
router_paths: ["/login"]
---

# 忘记密码 — Hooks工具函数

## 使用的 Hooks

### 模块相关 Hooks

| Hook | 来源 | 返回值 | 用途 |
|------|------|--------|------|
| `useSendCode` | `@/web/support/user/hooks/useSendCode` | `{ codeSending, sendCode, codeCountDown, SendCodeBox, openCodeAuthModal }` | 发送验证码并管理 60s 倒计时状态；返回 `SendCodeBox` 渲染组件用于显示发送按钮和倒计时文字 |

**useSendCode 详情**：
- 参数：`{ type: "findPassword" }`（验证码类型）
- 内部调用：`sendAuthCode` API → Google reCAPTCHA 人机验证
- `SendCodeBox`：内联渲染的发送验证码按钮组件，自动处理倒计时显示和可点击状态
- `codeSending`：loading 状态
- `sendCode`：手动触发发送
- `openCodeAuthModal`：人机验证弹窗开启标志

### 共享 Hooks

| Hook | 来源 | 用途 |
|------|------|------|
| `useRequest` | `@fastgpt/web/hooks/useRequest` | 管理异步请求的 loading 状态和错误处理 |
| `useToast` | `@fastgpt/web/hooks/useToast` | 显示成功/错误/警告等消息提示 |
| `useForm` | `react-hook-form` | 表单状态管理和校验（mode: `onBlur` 失焦校验） |
| `useTranslation` | `next-i18next` | i18n 国际化翻译 |

## 使用的工具函数

| 函数 | 来源 | 用途 |
|------|------|------|
| `checkPasswordRule` | `@fastgpt/global/common/string/password` | 密码复杂度校验：8-100 位，须包含字母+数字（至少两种组合） |
