---
capability_label: 首页设置
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:00:00.000Z"
parent_module: 设置
roles: [团队管理员]
router_paths: []
---

# 首页设置 — API索引

## 配置更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/update` | POST | 更新对话首页设置 | `src/web/core/chat/api.ts:41` → `src/pageComponents/chat/ChatSetting/HomepageSetting/index.tsx:101` | 对话首页→设置→HOME Tab→点击保存按钮时调用，提交所有首页设置变更 |

## 配置查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/chat/setting/detail` | GET | 获取对话设置详情 | `src/web/core/chat/api.ts:39` → `src/web/core/chat/context/chatPageContext.tsx:112` | 对话首页→页面初始化时加载；对话首页→保存设置成功后刷新 |

## 工具相关（通过 ToolSelectModal 间接调用）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 工具模板列表查询 | GET | 获取可用工具模板列表 | `src/web/core/app/api/tool.ts` → `ToolSelectModal.tsx:66` | 对话首页→设置→HOME Tab→打开工具选择弹窗→加载工具列表；搜索/切换目录时调用 |
| 工具预览节点查询 | GET | 获取工具的详细配置信息 | `src/web/core/app/api/tool.ts` → `ToolSelectModal.tsx:189` | 对话首页→设置→HOME Tab→点击添加工具→校验工具兼容性时调用 |
| 工具目录路径查询 | GET | 获取工具目录面包屑路径 | `src/web/core/app/api/tool.ts` → `ToolSelectModal.tsx:91` | 对话首页→设置→HOME Tab→进入工具子目录→加载面包屑导航时调用 |
| 工具标签列表查询 | GET | 获取工具分类标签 | `src/web/core/plugin/toolTag/api.ts` → `ToolSelectModal.tsx:76` | 对话首页→设置→HOME Tab→打开工具选择弹窗→加载标签筛选器数据 |

## 应用相关（通过 AddQuickAppModal 间接调用）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 团队应用列表查询 | GET | 获取团队下的应用和文件夹 | `src/web/core/app/api.ts` → `AddQuickAppModal.tsx:49` | 对话首页→设置→HOME Tab→打开快捷应用弹窗→加载应用列表；搜索/切换目录时调用 |
| 应用基本信息批量查询 | GET | 获取指定应用的基础信息（名称、头像） | `src/web/core/app/api.ts` → `AddQuickAppModal.tsx:124` | 对话首页→设置→HOME Tab→已选应用信息缺失时→回填应用名称和头像 |
| 应用目录路径查询 | GET | 获取应用目录面包屑路径 | `src/web/core/app/api.ts` → `AddQuickAppModal.tsx:62` | 对话首页→设置→HOME Tab→进入应用子目录→加载面包屑导航时调用 |

---

## API 调用链追踪

### `POST /proApi/core/chat/setting/update` 调用链

```
HomepageSetting/index.tsx (onSubmit)
  ├── 触发: 管理员点击「保存」按钮
  ├── 参数: { enableHome, slogan, quickAppIds, selectedTools }
  │     - enableHome: boolean — 首页启用状态
  │     - slogan: string — 欢迎标语
  │     - quickAppIds: string[] — 快捷应用 ID 数组
  │     - selectedTools: { pluginId, inputs }[] — 已选工具列表
  └── 响应处理:
        ├── onSuccess: 调用 refreshChatSetting() 刷新上下文设置数据
        └── successToast: 显示 "chat:setting.save_success" i18n 提示
```

### `GET /proApi/core/chat/setting/detail` 调用链

```
ChatPageContextProvider (初始化 + refreshChatSetting)
  ├── 触发: 页面首次加载 / refreshChatSetting 被调用
  ├── 参数: 无（直接从后端获取当前团队设置）
  ├── 分支条件:
  │     - feConfigs.isPlus 为 false: 不调用此接口（开源版无此功能）
  │     - enableHome 为 false 且当前 pane 为 HOME: 自动切换到 TEAM_APPS 面板
  │     - appId 变更: 自动同步路由参数
  └── 响应处理:
        └── 写入 ChatPageContext.chatSettings，供所有子组件消费
```

### 工具模板列表查询 调用链

```
ToolSelectModal.tsx (loadTemplates)
  ├── 触发: 弹窗打开 / 搜索关键词变更 / 目录切换 / 标签变更
  ├── 参数: { parentId, searchKey }
  ├── 节流: 搜索模式下 300ms throttle
  └── 响应处理:
        ├── 更新 templates 状态
        └── 按标签过滤（前端）：rawTemplates.filter(template.tags ∩ selectedTagIds)
```

### 团队应用列表查询 调用链

```
AddQuickAppModal.tsx (useRequest)
  ├── 触发: 弹窗打开 / 搜索关键词变更 / 目录切换
  ├── 参数: { parentId, searchKey, type: [folder, simple, workflow, chatAgent, assistant] }
  ├── 并行: getMyApps 与 getAppFolderPath 并行请求（搜索模式下跳过 getAppFolderPath）
  ├── 节流: 500ms throttleWait
  └── 响应处理:
        ├── apps: 渲染应用/文件夹列表
        └── paths: 渲染面包屑导航
```
