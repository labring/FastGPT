---
capability_label: 微信登录
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 登录首页
roles: []
router_paths:
  - /login (pageType=wechat)
---

# 微信登录 — API索引

## 查询/获取

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/support/user/account/login/wx/getQR` | GET | 获取微信登录二维码（code 和 codeUrl） | `projects/app/src/web/support/user/api.ts:51` → `projects/app/src/pageComponents/login/LoginForm/WechatForm.tsx:34` | 登录→微信登录→进入页面时调用（页面初始化） |
| `/proApi/support/user/account/login/wx/getResult` | POST | 查询微信扫码登录结果，返回用户登录信息 | `projects/app/src/web/support/user/api.ts:54` → `projects/app/src/pageComponents/login/LoginForm/WechatForm.tsx:46` | 登录→微信登录→每3秒轮询扫码结果时调用 |

## API 调用链追踪

### `GET /proApi/support/user/account/login/wx/getQR` 调用链

```
WechatForm (projects/app/src/pageComponents/login/LoginForm/WechatForm.tsx)
  ├── 触发: 页面挂载时自动调用（useQuery，无依赖条件）
  ├── 参数: 无
  └── 响应处理: 成功 → 提取 wechatInfo.code 和 wechatInfo.codeUrl；失败 → Toast 提示"获取二维码失败"
```

### `POST /proApi/support/user/account/login/wx/getResult` 调用链

```
WechatForm (projects/app/src/pageComponents/login/LoginForm/WechatForm.tsx)
  ├── 触发: wechatInfo.code 可用后自动轮询（refetchInterval: 3000ms）
  ├── 参数:
  │   ├── code: 上一步 getWXLoginQR 返回的微信登录 Code
  │   ├── inviterId: localStorage 中的邀请人 ID
  │   ├── bd_vid: Cookie 中的百度推广标识
  │   ├── msclkid: Cookie 中的微软广告点击 ID
  │   ├── fastgpt_sem: Cookie 中的 FastGPT SEM 标识
  │   └── sourceDomain: document.referrer 来源域名
  └── 响应处理:
        ├── 返回有效登录数据 → 清除 fastgpt_sem Cookie → 调用 loginSuccess(data) 完成登录跳转
        └── 返回 null/undefined → 继续轮询
```
