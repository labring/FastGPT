---
capability_label: "设置"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:10:00Z"
parent_module: "对话首页"
roles: ["管理员"]
router_paths: ["/chat?pane=s"]
---

# 设置 — API索引

## 聊天设置

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/detail` | GET | 获取当前对话首页设置 | `web/core/chat/api.ts:39` → `web/core/chat/context/chatPageContext.tsx:112` | 对话首页→设置→页面加载时自动调用；刷新设置后调用 |
| `/proApi/core/chat/setting/update` | POST | 更新对话首页设置 | `web/core/chat/api.ts:42` → `ChatSetting/HomepageSetting/index.tsx:101` | 对话首页→设置→首页配置→保存设置时调用 |

## 精选应用管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/favourite/list` | GET | 获取精选应用列表 | `web/core/chat/api.ts:45` → `ChatSetting/FavouriteAppSetting/index.tsx:86` | 对话首页→设置→精选应用→加载时调用；搜索/标签筛选变化时调用 |
| `/proApi/core/chat/setting/favourite/update` | POST | 批量添加/更新精选应用 | `web/core/chat/api.ts:48` → `ChatSetting/FavouriteAppSetting/AddFavouriteAppModal.tsx:38` | 对话首页→设置→精选应用→添加精选应用→确认时调用 |
| `/proApi/core/chat/setting/favourite/order` | PUT | 更新精选应用排序 | `web/core/chat/api.ts:51` → `ChatSetting/FavouriteAppSetting/index.tsx:103` | 对话首页→设置→精选应用→拖拽排序完成时调用 |
| `/proApi/core/chat/setting/favourite/delete` | DELETE | 删除单个精选应用 | `web/core/chat/api.ts:57` → `ChatSetting/FavouriteAppSetting/index.tsx:112` | 对话首页→设置→精选应用→点击删除→确认后调用 |
| `/proApi/core/chat/setting/favourite/tags` | PUT | 批量更新精选应用标签 | `web/core/chat/api.ts:54` → `ChatSetting/FavouriteAppSetting/TagManageModal.tsx:112` | 对话首页→设置→精选应用→标签管理→保存时调用 |

## 日志相关

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/logs/*`（推测） | GET | 获取对话日志列表 | 通过 `LogsContextProvider` / `LogTable` 组件间接调用 | 对话首页→设置→首页日志→加载时调用；筛选条件变化时调用 |

> 日志相关 API 通过共享组件 `LogsContextProvider`、`LogTable`、`LogChart` 间接调用，具体 API 路径在日志模块中定义。

## API 调用链追踪

### `GET /proApi/core/chat/setting/detail` 调用链

```
ChatPageContextProvider
  ├── 触发: 页面加载时自动调用（manual: false），依赖 feConfigs.isPlus
  ├── 参数: 无
  └── 响应处理: 存储为 chatSettings；根据 enableHome 决定是否重定向

ChatSetting/index.tsx
  ├── 触发: 通过 ChatPageContext 消费 chatSettings 数据
  └── 使用: 判断 chatSettings 是否存在以渲染 Tab 内容
```

### `POST /proApi/core/chat/setting/update` 调用链

```
HomepageSetting/index.tsx
  ├── 触发: 管理员点击"保存"按钮
  ├── 参数: { enableHome, slogan, selectedTools, quickAppIds }
  └── 响应处理: 刷新 chatSettings，显示成功 Toast

TagManageModal.tsx
  ├── 触发: 标签管理弹窗保存
  ├── 参数: { favouriteTags }
  └── 响应处理: 关闭弹窗，刷新列表
```

### `GET /proApi/core/chat/setting/favourite/list` 调用链

```
FavouriteAppSetting/index.tsx
  ├── 触发: 精选应用 Tab 加载时自动调用；搜索框输入（500ms throttle）
  ├── 参数: { name?, tag? }
  └── 响应处理: 更新 localFavourites 列表状态
```

### `DELETE /proApi/core/chat/setting/favourite/delete` 调用链

```
FavouriteAppSetting/index.tsx
  ├── 触发: 管理员点击精选应用行中的删除按钮 → PopoverConfirm 确认
  ├── 参数: { id: app._id }
  └── 响应处理: 移除本地列表中的该项，触发明细刷新
```
