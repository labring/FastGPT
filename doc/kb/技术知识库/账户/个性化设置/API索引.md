---
capability_label: "个性化设置"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:55:00.000Z"
parent_module: "账户"
roles: ["所有登录用户"]
router_paths: ["/account/setting"]
---

# 个性化设置 — API索引

本模块不包含独立的 API 定义文件，而是通过共享用户 Store（`useUserStore`）间接调用用户 API 层。以下列出本模块实际触发的 API。

## 用户账户更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/update` | PUT | 更新用户个人设置（语言/时区） | `src/web/support/user/api.ts:113` → `src/web/support/user/useUserStore.ts:89` → `src/pages/account/setting.tsx:27` | 账户→个性化设置→切换语言时调用；账户→个性化设置→切换时区时自动调用 |

## 用户信息获取

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/user/account/tokenLogin` | GET | 获取当前登录用户完整信息（含语言、时区等偏好） | `src/web/support/user/api.ts:37` → `src/web/support/user/useUserStore.ts:54` | 账户→个性化设置→页面初始化时由 useUserStore.initUserInfo 调用（应用级，非页面级） |

---

## API 调用链追踪

### `PUT /support/user/account/update` 调用链

```
页面组件: src/pages/account/setting.tsx
  ├── 触发: 用户在下拉框中切换语言或时区
  ├── 参数: { language?: string, timezone?: string }
  ├── 经由: useUserStore.updateUserInfo(user) → putUserInfo(user)
  ├── 乐观更新: Store 中 userInfo 先更新，后端失败时回滚
  └── 响应处理: 成功无额外处理；失败回滚 userInfo，reject error

I18nLngSelector 组件: src/components/Select/I18nLngSelector.tsx
  ├── 触发: 用户在语言下拉框中选择语言
  ├── 参数: { language: LangEnum }
  ├── 经由: useUserStore.updateUserInfo({ language }) → putUserInfo({ language })
  └── 响应处理: 语言切换后在 onChangeLngI18n 中更新前端 i18n 语言包
```

### `GET /support/user/account/tokenLogin` 调用链

```
useUserStore.initUserInfo: src/web/support/user/useUserStore.ts:50
  ├── 触发: 应用初始化时自动调用（非页面级触发）
  ├── 参数: 无（基于登录 cookie/token）
  ├── 响应: UserType（含 language, timezone, avatar, team 等字段）
  └── 响应处理: setUserInfo(res) → 设置 userInfo + isTeamAdmin + 同步语言到 localStorage
```
