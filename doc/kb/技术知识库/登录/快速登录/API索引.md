---
capability_label: 快速登录
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:47:00.000Z
parent_module: 登录
roles:
  - 未登录用户
router_paths:
  - /login/fastlogin
---

# 快速登录 — API 索引

## 认证

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/fastLogin` | POST | 提交快速登录凭证完成身份认证 | `src/web/support/user/api.ts:41` → `src/pages/login/fastlogin.tsx:41` | 登录→快速登录→页面加载时自动调用 |

## API 调用链追踪

### `/proApi/support/user/account/login/fastLogin` 调用链

```
快速登录页面 (fastlogin.tsx)
  ├── 触发: 页面加载时 useEffect 自动调用 authCode(code, token)
  ├── 参数: { code: string, token: string }
  ├── 响应处理:
  │     ├── 成功: setUserInfo(res.user) 写入用户信息 → router.push(callbackUrl) 跳转
  │     └── 失败: Toast 警告提示 → 1 秒后 router.replace('/login') 跳回登录页
  └── 请求方式: 串行，在 clearToken() 之后执行
```

## 说明

快速登录模块仅使用一个 API 端点 `postFastLogin`。该 API 定义在共享用户 API 文件 `src/web/support/user/api.ts` 中，与登录首页、第三方登录等模块共享同一 API 层。

此外，页面还间接调用了 `GET /support/user/account/loginout`（通过 `clearToken` → `loginOut`），该接口用于清除旧登录状态，属于通用认证基础设施 API，详见父模块[登录 API 索引](../../技术知识库/登录/API索引.md)。
