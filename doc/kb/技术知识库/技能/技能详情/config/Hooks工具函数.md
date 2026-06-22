---
capability_label: config
doc_type: "16"
doc_label: Hooks工具函数
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 技能详情
roles: [skill_owner, skill_writer]
router_paths: [/skill/detail]
---

# 技能详情 — Config Tab Hooks工具函数

## 自定义 Hooks

### useFileTree

**文件**: `hooks/useFileTree.ts`

**签名**: `useFileTree({ skillId }: UseFileTreeParams)`

管理技能包文件目录树的加载、展开、搜索和刷新。

**返回值**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `fileTree` | `TreeNode[]` | 完整文件树数据 |
| `filteredTree` | `TreeNode[]` | 按搜索词过滤后的文件树 |
| `expandedDirs` | `Set<string>` | 已展开目录路径集合 |
| `loadingDirs` | `Set<string>` | 正在加载中的目录路径集合 |
| `loadingRoot` | `boolean` | 根目录是否正在加载 |
| `searchQuery` | `string` | 搜索关键词 |
| `setSearchQuery` | `(q: string) => void` | 设置搜索关键词 |
| `loadDirectory` | `(path, level) => Promise<TreeNode[]>` | 懒加载指定目录 |
| `reloadRoot` | `() => Promise<void>` | 以 recursive 模式重新加载整个文件树 |
| `toggleDirectory` | `(node) => Promise<void>` | 展开/折叠目录（首次展开时懒加载） |
| `refreshDir` | `(dirPath) => Promise<void>` | 刷新指定目录内容 |

---

### useAutoSave

**文件**: `hooks/useAutoSave.ts`

**签名**: `useAutoSave({ skillId }: UseAutoSaveParams)`

管理编辑器内容的防抖自动保存。编辑器中每次内容变更触发 `scheduleAutoSave`，800ms 内无新变更则自动调用 `writeSkillPackageFile` 写入后端。

**返回值**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `scheduleAutoSave` | `(path, content) => void` | 调度自动保存（800ms 防抖） |
| `flushPendingForPath` | `(prefix) => Promise<void>` | 强制刷新指定路径及其子路径的所有待保存内容 |
| `flushAllPending` | `() => Promise<void>` | 强制刷新全部待保存内容（Preview Tab 同步沙箱前使用） |
| `cancelPendingForPath` | `(prefix) => void` | 取消指定路径的待保存操作 |
| `closeFile` | `(path) => void` | 关闭文件时立即刷新并移除待保存定时器 |
| `setOpenedFilesRef` | `(files) => void` | 同步已打开文件引用（供 scheduleAutoSave 读取最新内容） |
| `packageVersionRef` | `MutableRefObject<number>` | 包版本号引用，每次写入成功后更新 |

---

### useFileOperations

**文件**: `hooks/useFileOperations.tsx`

**签名**: `useFileOperations(params: UseFileOperationsParams)`

管理文件操作的全部逻辑：打开/关闭文件、CRUD 操作（创建、重命名、删除、上传）、命名弹窗、确认对话框。

**返回值**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `openedFiles` | `OpenedFile[]` | 当前已打开的文件列表 |
| `setOpenedFiles` | `Dispatch<SetStateAction<OpenedFile[]>>` | 更新已打开文件列表 |
| `activeFilePath` | `string` | 当前激活的文件路径 |
| `setActiveFilePath` | `(path: string) => void` | 切换激活文件 |
| `activeFile` | `OpenedFile \| undefined` | 当前激活文件的完整信息 |
| `openFile` | `(path: string) => Promise<void>` | 打开文件（已打开则切换激活） |
| `closeFile` | `(path, e?) => void` | 关闭文件并清理 blob URL |
| `loadingFile` | `boolean` | 是否正在加载文件内容 |
| `handleCreateFile` | `(parentDir: string) => Promise<void>` | 创建新文件流程 |
| `handleCreateFolder` | `(parentDir: string) => Promise<void>` | 创建新文件夹流程 |
| `handleUploadFiles` | `(parentDir, files: File[]) => Promise<void>` | 上传文件流程 |
| `handleRename` | `(node: TreeNode) => Promise<void>` | 重命名流程 |
| `handleDelete` | `(node: TreeNode) => void` | 删除确认流程 |
| `refreshOpenedFiles` | `() => Promise<void>` | 重新加载所有已打开文件内容 |
| `DeleteConfirmModal` | `React.FC` | 删除确认弹窗组件 |
| `isNameModalOpen` / `handleNameConfirm` / `handleNameCancel` | — | 命名弹窗控制 |
| `nameInputValue` / `setNameInputValue` | — | 命名输入值 |

---

## 工具函数

### getIconByFilename

**文件**: `utils.tsx`

**签名**: `getIconByFilename(filename: string): IconNameType`

根据文件扩展名返回对应的图标名。支持 30+ 种文件类型识别（编程语言、文档、图片、视频、压缩包等），未匹配返回默认文件图标。

---

### getLanguageByFileName

**文件**: `utils.tsx`

**签名**: `getLanguageByFileName(fileName: string): string`

根据文件扩展名返回 Monaco Editor 的语言标识符（如 `typescript`、`python`、`markdown`）。用于 Editor 组件的 `language` 属性，实现语法高亮。未匹配返回 `'plaintext'`。

---

### getIsBinaryByLanguage

**文件**: `utils.tsx`

**签名**: `getIsBinaryByLanguage(language: string): boolean`

判断语言类型是否为二进制（image / audio / video）。二进制文件通过 Blob URL 渲染预览而非 Monaco Editor。

---

### getSupportsPreviewToggle

**文件**: `utils.tsx`

**签名**: `getSupportsPreviewToggle(language?: string): boolean`

判断当前文件是否支持源码/预览切换。仅 Markdown 和 SVG 文件支持。

---

### updateTreeNode

**文件**: `utils.tsx`

**签名**: `updateTreeNode<T>(tree: T[], targetPath: string, children: T[], loaded?: boolean): T[]`

不可变地更新文件树中指定路径节点的子节点。用于目录懒加载后将子节点合并到现有树结构。

---

### filterTree

**文件**: `utils.tsx`

**签名**: `filterTree<T>(nodes: T[], query: string): T[]`

按搜索关键词递归过滤文件树。文件名匹配时保留该文件节点；目录下任意子节点匹配时保留目录节点及其匹配子节点。
