---
capability_label: 收藏应用
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:30:00Z
parent_module: 设置
roles:
  - 团队管理员
router_paths:
  - /chat?pane=s&tab=f
---

# 收藏应用 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/favourite/list` | GET | 获取收藏应用列表（支持按名称和标签筛选） | `api.ts:44` → `index.tsx:86`<br>`api.ts:44` → `TagManageModal.tsx:197`<br>`api.ts:44` → `TagManageModal.tsx:468`<br>`api.ts:44` → `AddFavouriteAppModal.tsx:70` | 收藏应用→列表页→加载时调用；收藏应用→列表页→搜索/筛选时调用；收藏应用→分类管理→标签分配子面板→加载和搜索时调用；收藏应用→添加应用→弹窗初始化时调用 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/favourite/update` | POST | 批量添加/更新收藏应用 | `api.ts:47` → `AddFavouriteAppModal.tsx:91` | 收藏应用→添加应用弹窗→点击确定按钮时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/favourite/order` | PUT | 更新收藏应用排序 | `api.ts:50` → `index.tsx:103` | 收藏应用→列表页→拖拽排序释放时调用 |
| `/proApi/core/chat/setting/favourite/tags` | PUT | 更新收藏应用的标签关联 | `api.ts:53` → `TagManageModal.tsx:258` | 收藏应用→分类管理→标签分配子面板→保存时调用 |
| `/proApi/core/chat/setting/update` | POST | 更新对话设置（含分类标签列表） | `api.ts:41` → `TagManageModal.tsx:393` | 收藏应用→分类管理弹窗→创建/编辑/删除/排序标签时调用 |

---

## API 调用链追踪

### `/proApi/core/chat/setting/favourite/list` 调用链

```
FavouriteAppSetting/index.tsx (getApps)
  ├── 触发: 页面加载(mount)、搜索值变化(searchAppNameValue)、筛选值变化(searchAppTagValue)
  ├── 参数: { name: string, tag: string }，均为可选
  ├── 节流: 500ms
  └── 响应处理: setLocalFavourites(apps) 写入本地状态

TagManageModal.tsx (SaveTagForAppSubPanel)
  ├── 触发: 子面板加载(mount)、搜索词变化(searchAppName)
  ├── 参数: { name: string }，用于筛选可见应用
  ├── 节流: 500ms
  └── 响应处理: 用于渲染子面板中的应用勾选列表

TagManageModal.tsx (allFavourites)
  ├── 触发: 标签管理弹窗加载、子面板开关状态变化
  ├── 参数: { name: '' }，获取全量数据
  └── 响应处理: 计算每个标签关联的应用数量(tagIdToCount)

AddFavouriteAppModal.tsx
  ├── 触发: 弹窗加载(mount)
  ├── 参数: 无（默认参数）
  └── 响应处理: 初始化已选应用列表(selectedApps)
```

### `/proApi/core/chat/setting/favourite/update` 调用链

```
AddFavouriteAppModal.tsx (updateFavourites)
  ├── 触发: 用户点击「确定」按钮
  ├── 参数: { appId: string, order: number }[]
  ├── 手动触发(manual: true)
  └── 响应处理: 成功后调用 onRefresh() 刷新父组件列表，关闭弹窗
```

### `/proApi/core/chat/setting/favourite/order` 调用链

```
FavouriteAppSetting/index.tsx (orderApp)
  ├── 触发: 拖拽释放(onDragEndCb)
  ├── 参数: { id: string, order: number }[]
  ├── 手动触发(manual: true)
  └── 响应处理: 调用 getApps() 刷新列表
```

### `/proApi/core/chat/setting/favourite/tags` 调用链

```
TagManageModal.tsx (saveApps — SaveTagForAppSubPanel)
  ├── 触发: 用户点击子面板「保存」按钮
  ├── 参数: { id: string, tags: string[] }[]
  ├── 手动触发(manual: true)
  └── 响应处理: 调用 onRefresh() 和 onClose() 退出子面板
```

### `/proApi/core/chat/setting/update` 调用链

```
TagManageModal.tsx (updateTags)
  ├── 触发: 标签创建确认、重命名确认、删除确认、拖拽排序释放
  ├── 参数: { favouriteTags: ChatFavouriteTagType[] }
  ├── 手动触发(manual: true)
  └── 响应处理: 调用 refreshChatSetting() 刷新上下文中的标签数据
```

### `/proApi/core/chat/setting/favourite/delete` 调用链

```
FavouriteAppSetting/index.tsx (deleteApp)
  ├── 触发: 用户点击删除 → 确认弹窗确认
  ├── 参数: { id: string }
  ├── 手动触发(manual: true)
  └── 响应处理: 乐观更新本地列表(过滤移除 + 重新编号)，调用 getApps() 刷新
```
