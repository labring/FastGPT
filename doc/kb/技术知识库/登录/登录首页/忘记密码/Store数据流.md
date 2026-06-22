---
capability_label: 忘记密码
doc_type: "14"
doc_label: Store数据流
generated_at: 2026-06-18T10:51:08.000Z
parent_module: 登录首页
roles: []
router_paths: ["/login"]
---

# 忘记密码 — Store数据流

## 使用的 Store

本模块不定义自己的 Store，使用以下共享 Store：

### useSystemStore

- **来源**: `@/web/common/system/useSystemStore`
- **使用字段**:
  - `feConfigs.find_password_method: string[]` — 启用的密码找回方式列表（`email` / `phone`），用于动态生成账号输入框的占位提示文字
  - `feConfigs.systemTitle: string` — 系统标题，用于表单标题文案（如"找回 {系统名} 账号密码"）
  - `feConfigs.googleClientVerKey?: string` — Google reCAPTCHA 密钥（传递给 `useSendCode` hook 用于人机验证）

- **数据流向**: 
  ```
  useSystemStore (全局)
    └── feConfigs (仅读，从后端初始化配置获取)
        ├── ──→ ForgetPasswordForm: 控制账号占位符文案、表单标题
        └── ──→ useSendCode: 控制人机验证（googleClientVerKey）
  ```
