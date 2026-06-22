---
capability_label: config
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 技能详情
roles: [skill_owner, skill_writer]
router_paths: [/skill/detail]
---

# 技能详情 — Config Tab API索引

## 文件查询与读取

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/package/list` | POST | 列出技能包目录内容 | `api.ts:22` → `useFileTree.ts:45`<br>`api.ts:22` → `useFileTree.ts:63` | 技能详情→Config Tab→加载时调用（首次加载根目录）；技能详情→Config Tab→展开目录时调用（懒加载子目录） |
| `/core/agentSkills/package/read` | POST | 读取技能包内文件内容（二进制流） | `api.ts:28` → `useFileOperations.tsx:91` | 技能详情→Config Tab→点击文件名打开文件时调用；技能详情→Config Tab→版本过期后刷新已打开文件时调用 |
| `/core/agentSkills/package/checkVersion` | POST | 检查技能包版本是否变化 | `api.ts:120` → `index.tsx:64`<br>`api.ts:120` → `index.tsx:77` | 技能详情→Config Tab→页面加载时调用（获取初始版本号）；技能详情→Config Tab→定时轮询（每30秒）；技能详情→Config Tab→窗口获得焦点时调用 |

## 文件写入

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/package/write` | POST | 写入单个文件内容 | `api.ts:45` → `useAutoSave.ts:22`<br>`api.ts:45` → `useFileOperations.tsx:166` | 技能详情→Config Tab→编辑源码后自动保存（800ms 防抖）；技能详情→Config Tab→创建新文件时调用；技能详情→Config Tab→文件重命名前刷新待保存内容时调用；技能详情→Config Tab→关闭文件时刷新待保存内容时调用 |
| `/core/agentSkills/package/batchWrite` | POST | 批量写入多个文本文件（单次 zip 重写） | `api.ts:50`（未被当前模块调用，为外部调用预留） | —（当前模块未使用此 API） |

## 文件管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/package/mkdir` | POST | 新建目录 | `api.ts:68` → `useFileOperations.tsx:187` | 技能详情→Config Tab→确认创建文件夹名称后调用 |
| `/core/agentSkills/package/rename` | POST | 重命名文件或目录 | `api.ts:62` → `useFileOperations.tsx:264` | 技能详情→Config Tab→确认重命名后调用（重命名前先刷新待保存内容） |
| `/core/agentSkills/package/delete` | POST | 删除文件或目录（支持递归） | `api.ts:56` → `useFileOperations.tsx:295` | 技能详情→Config Tab→确认删除对话框后调用 |
| `/core/agentSkills/package/upload` | POST | 上传二进制文件（FormData） | `api.ts:83` → `useFileOperations.tsx:224` | 技能详情→Config Tab→选择本地文件后逐文件上传 |

## 沙箱同步

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/package/sandbox/sync` | POST | 同步技能包到运行中的沙箱 | `api.ts:113`（当前模块仅导出，由 Preview Tab 调用） | 技能详情→Preview Tab→Run Preview 前调用（将编辑器中最新内容推送到沙箱） |

---

## API 调用链追踪

### `/core/agentSkills/package/list` 调用链

```
useFileTree.reloadRoot() (首次加载)
  ├── 触发: 组件挂载（useMount）→ Config Tab 进入
  ├── 参数: { skillId, path: '.', recursive: true }
  └── 响应处理: 将后端文件列表转为 TreeNode[] 树结构，更新 fileTree 状态

useFileTree.loadDirectory() (懒加载)
  ├── 触发: 用户点击展开未加载的目录
  ├── 参数: { skillId, path }
  └── 响应处理: 调用 updateTreeNode 将子节点合并到现有树，标记目录为已加载
```

### `/core/agentSkills/package/read` 调用链

```
useFileOperations.loadFile()
  ├── 触发: 用户点击文件名（openFile）
  ├── 参数: { skillId, path }
  └── 响应处理:
      ├── 二进制文件（image/audio/video）→ 转 Blob → URL.createObjectURL
      ├── 文本文件 → ArrayBuffer → TextDecoder UTF-8 解码
      └── UTF-8 解码失败 → 标记 isUnknown，前端展示无预览提示
```

### `/core/agentSkills/package/write` 调用链

```
useAutoSave.writeFile()
  ├── 触发: setTimeout 800ms 防抖后自动执行
  ├── 参数: { skillId, path, content }
  └── 响应处理: 更新 packageVersionRef = result.packageVersion

useFileOperations.handleCreateFile()
  ├── 触发: 用户确认新文件名称
  ├── 参数: { skillId, path, content: '' }
  └── 响应处理: 刷新父目录文件树 → 打开新文件进入编辑

useAutoSave.flushPendingForPath()
  ├── 触发: 重命名/关闭文件前强制刷新
  ├── 参数: { skillId, path, content }（批量）
  └── 响应处理: Promise.all 并行写入所有待保存文件
```

### `/core/agentSkills/package/upload` 调用链

```
useFileOperations.handleUploadFiles()
  ├── 触发: 用户选择文件后确认上传
  ├── 参数: FormData { skillId, path, file }（逐文件循环）
  └── 响应处理: 更新 packageVersion → 成功提示 → 刷新父目录
```

### `/core/agentSkills/package/delete` 调用链

```
useFileOperations.handleDelete()
  ├── 触发: 用户确认删除（useConfirm 弹窗）
  ├── 参数: { skillId, path, recursive: node.type === 'directory' }
  └── 响应处理: 清除已打开文件中该路径及其子路径的 tab → 刷新父目录

### `/core/agentSkills/package/checkVersion` 调用链

```
checkSkillPackageVersion (初始化)
  ├── 触发: useEffect 组件挂载
  ├── 参数: { skillId, knownVersion: 0 }
  └── 响应处理: packageVersionRef.current = result.currentVersion

checkSkillPackageVersion (轮询)
  ├── 触发: setInterval 30s / window focus 事件
  ├── 参数: { skillId, knownVersion: packageVersionRef.current }
  └── 响应处理: result.changed === true → setStaleDetected(true) → 显示黄色过期提示条
```
