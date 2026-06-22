---
capability_label: 对话首页
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00Z"
parent_module: 对话
roles: ["登录用户", "管理员", "Plus版用户"]
router_paths: ["/chat"]
---

# 对话首页 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/chat/recentlyUsed` | GET | 获取最近使用的应用列表 | `src/web/core/chat/api.ts:25` → `src/web/core/chat/context/chatPageContext.tsx:78` | 对话首页→页面初始化→加载时调用；对话首页→30秒轮询刷新时调用 |
| `/proApi/core/chat/setting/detail` | GET | 获取对话首页设置（首页应用、布局配置） | `src/web/core/chat/api.ts:39` → `src/web/core/chat/context/chatPageContext.tsx:109` | 对话首页→页面初始化→Plus版用户加载时调用 |

## API 调用链追踪

### `/core/chat/recentlyUsed` 调用链

```
ChatPageContextProvider
  ├── 触发: 页面加载初始化（useMount），用户 tmbId 变更时刷新
  ├── 参数: 无（自动使用当前用户 session）
  ├── 轮询: 30 秒间隔自动刷新，500ms 防抖
  └── 响应处理: 更新 myApps 状态 → ChatSlider 的最近使用列表渲染
```

### `/proApi/core/chat/setting/detail` 调用链

```
ChatPageContextProvider
  ├── 触发: 页面加载初始化（feConfigs.isPlus 为 true 时）
  ├── 参数: 无
  ├── 刷新依赖: feConfigs.isPlus
  └── 响应处理:
      ├── enableHome 为 false 且当前在首页面板 → 自动切换到团队应用
      ├── 首页 appId 不匹配且不在快捷列表中 → 自动跳转到配置的首页应用
      └── 更新 chatSettings 状态 → 各子组件消费
```

## 说明

本模块作为对话入口页面，API 调用主要集中在初始化阶段。各 Tab 面板的 API 调用见对应子能力文档。服务端渲染阶段还有以下数据库查询（非 HTTP API）：

- `MongoOutLink.findOne` — 查询发布渠道外链配置（`fromPublish` 存在时）
- `MongoApp.findById` — 查询应用所属团队 ID

此外，`initUserInfo`（useUserStore）在页面加载时执行用户信息初始化，属于前端 Store 操作，非直接 HTTP API 调用。
