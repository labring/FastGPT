---
capability_label: 精选应用
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: 对话首页
roles: [普通用户, 管理员]
router_paths: []
---

# 精选应用 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/favourite/list` | GET | 获取精选应用列表 | `projects/app/src/web/core/chat/api.ts:44` → `projects/app/src/pageComponents/chat/ChatFavouriteApp/index.tsx:77` | 对话首页→精选应用面板→加载时调用；对话首页→精选应用面板→切换标签筛选时调用；对话首页→精选应用面板→搜索名称时调用 |

## API 调用链追踪

### `/proApi/core/chat/setting/favourite/list` 调用链

```
ChatFavouriteApp (projects/app/src/pageComponents/chat/ChatFavouriteApp/index.tsx)
  ├── 触发: 进入精选应用面板自动加载 / 切换标签 / 输入搜索关键词
  ├── 参数: { name?: string, tag?: string }
  │    ├── name: 应用名称搜索关键词（空字符串表示不筛选）
  │    └── tag: 分类标签 ID（空字符串表示"全部"）
  ├── 调用方式: 通过 getFavouriteApps() 封装函数，使用 useRequest hook
  ├── 节流: throttleWait=500ms
  ├── 刷新依赖: [searchAppName, selectedTag]
  └── 响应处理:
       ├── 成功 → 赋值 favouriteApps 状态，加载遮罩关闭
       └── 失败 → 使用 useRequest 默认错误处理
```

## 说明

本模块仅涉及一个 API — 获取精选应用列表。精选应用的增删改（添加、删除、排序、标签分配）以及标签管理均在对话设置模块中处理，不属于本模块的 API 范围。
