---
capability_label: 技能管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: 工作台
roles: [团队管理员, 团队成员]
router_paths: [/dashboard/skill]
---

# 技能管理 — API索引

> API 定义文件: `projects/app/src/web/core/skill/api.ts`

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/list` | POST | 获取技能列表（支持分页、搜索、文件夹过滤） | `api.ts:24` → `context.tsx:58` | 工作台→技能管理→加载列表时调用；工作台→技能管理→搜索/进入文件夹时调用（refreshDeps 响应 searchKey/parentId 变化） |
| `/core/agentSkills/detail` | GET | 获取技能详情 | `api.ts:36` → `detail/context.tsx:50` | 工作台→技能管理→技能详情页→加载时调用 |
| `/core/agentSkills/folder/path` | GET | 获取文件夹面包屑路径 | `api.ts:65` → `context.tsx:81` | 工作台→技能管理→进入子文件夹后获取导航路径 |
| `/core/agentSkills/apps` | GET | 获取引用某技能的应用列表 | `api.ts:76` → `List.tsx:60` | 工作台→技能管理→悬停关联应用数时调用（Popover 触发） |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/create` | POST | 创建技能（支持 AI 辅助生成 SKILL.md） | `api.ts:40` → `CreateSkillModal` | 工作台→技能管理→创建技能→提交创建表单时调用 |
| `/core/agentSkills/folder/create` | POST | 创建技能文件夹 | `api.ts:61` → `index.tsx:42` | 工作台→技能管理→创建文件夹→提交时调用 |
| `/core/agentSkills/import` | POST | 导入技能 ZIP/TAR 压缩包 | `api.ts:54` → `ImportSkillModal.tsx:45` | 工作台→技能管理→导入技能→确认上传时调用（FormData 包含文件和 parentId） |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/update` | POST | 更新技能基本信息（名称、描述、头像）和移动 | `api.ts:44` → `List.tsx:184,205` | 工作台→技能管理→编辑信息→提交时调用；工作台→技能管理→移动→确认目标文件夹时调用 |

## 复制

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/copy` | POST | 创建技能副本 | `api.ts:47` → `List.tsx:173` | 工作台→技能管理→复制技能→确认后调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/delete` | DELETE | 删除技能或文件夹（软删除，递归删除子项） | `api.ts:51` → `List.tsx:165` | 工作台→技能管理→删除→确认弹窗后调用 |

## 导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/agentSkills/export` | GET | 导出技能 ZIP 压缩包（触发浏览器下载） | `api.ts:69` → `List.tsx:227` | 工作台→技能管理→导出配置→调用下载 |

## 权限管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/resumeInheritPermission` | GET | 恢复技能权限继承 | `api.ts:88` → `List.tsx:512` | 工作台→技能管理→权限设置→恢复继承时调用 |
| `/proApi/core/agentSkills/changeOwner` | POST | 转让技能所有者 | `api.ts:92` → `List.tsx:503` | 工作台→技能管理→权限设置→转让所有者时调用 |

## API 调用链追踪

### `/core/agentSkills/list` 调用链

```
SkillListContextProvider (context.tsx)
  ├── 触发: 页面加载 / searchKey 变化 / parentId 变化（refreshDeps）
  ├── 参数: { source: 'mine', searchKey, parentId }
  └── 响应处理: 数据映射为 SkillListItemType[]，日期转换、权限对象构造；更新 Context 触发 List 组件重渲染

SkillSelectModal (app detail 工具选择器)
  ├── 触发: 应用编辑→工具选择→选择技能时打开弹窗
  ├── 参数: 分页获取所有可用技能
  └── 响应处理: 渲染可选技能列表供用户选择
```

### `/core/agentSkills/folder/create` 调用链

```
SkillPageContent (index.tsx)
  ├── 触发: 用户点击"创建文件夹"按钮 → 填写名称和描述 → 确认
  ├── 参数: { name, description, parentId }
  └── 响应处理: 成功后调用 loadSkills() 刷新列表
```

### `/core/agentSkills/import` 调用链

```
ImportSkillModal (ImportSkillModal.tsx)
  ├── 触发: 用户选择/拖拽上传文件 → 点击确认
  ├── 参数: FormData { file, parentId? }
  └── 响应处理: 成功后关闭弹窗并调用 onSuccess 回调刷新列表
```

### `/core/agentSkills/delete` 调用链

```
List (List.tsx)
  ├── 触发: 用户点击删除菜单 → 确认弹窗（二次确认需输入技能名称）→ 确认
  ├── 参数: { skillId }
  ├── 前置检查: 关联应用数为 0（> 0 时删除按钮置灰并提示）
  └── 响应处理: 成功后 loadSkills() 刷新列表

后端 controller (packages/service)
  ├── 软删除: updateMany 设置 deleteTime
  ├── 文件夹递归: findSkillAndAllChildren 查找所有子节点
  ├── 版本软删除: MongoAgentSkillsVersion.updateMany
  └── 异步清理: 删除 MinIO 包文件 + 沙箱资源
```

### `/core/agentSkills/copy` 调用链

```
List (List.tsx)
  ├── 触发: 用户点击复制菜单 → 确认弹窗 → 确认
  ├── 参数: { skillId }
  └── 响应处理: 成功后 loadSkills() 刷新列表
```

### `/api/core/agentSkills/export` 调用链

```
List (List.tsx)
  ├── 触发: 用户点击导出配置菜单
  ├── 参数: skillId（URL 查询参数）
  └── 响应处理: 浏览器触发 ZIP 文件下载（downloadFetch）
```

### `/core/agentSkills/apps` 调用链

```
RelatedAppsContent (List.tsx)
  ├── 触发: 用户悬停关联应用数量标签（Popover hover 触发）
  ├── 参数: { skillId }
  └── 响应处理: 渲染应用列表（头像、名称、创建者），显示最多 5 项，超出滚动
```

### `/proApi/core/agentSkills/changeOwner` 调用链

```
ConfigPerModal → List (List.tsx)
  ├── 触发: 权限设置弹窗中转让所有者操作
  ├── 参数: { skillId, ownerId }
  └── 响应处理: 成功后 loadSkills() 刷新
```
