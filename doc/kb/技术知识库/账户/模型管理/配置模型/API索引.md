---
capability_label: "配置模型"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T11:05:00.000Z"
parent_module: "模型管理"
roles: ["root", "团队管理员", "团队成员"]
router_paths: ["/account/model"]
---

# 配置模型 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/ai/model/list` | POST | 获取系统模型列表 | `web/core/ai/config.ts:15` → `ModelConfigTable.tsx:98` | 账户→模型管理→配置模型→加载时调用；创建/编辑/删除/启禁用操作后刷新调用 |
| `/api/core/ai/model/detail` | GET | 获取单个模型详情 | `web/core/ai/config.ts:19` → `ModelConfigTable.tsx:293` | 账户→模型管理→配置模型→点击编辑图标时调用 |
| `/api/core/ai/model/getConfigJson` | GET | 获取模型配置 JSON | `web/core/ai/config.ts:31` → `ModelConfigTable.tsx:566` | 账户→模型管理→配置模型→root 点击「配置文件」按钮时调用 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/ai/model/create` | POST | 创建自定义模型 | `web/core/ai/config.ts:27` → `AddModelBox.tsx`（ModelEditModal） | 账户→模型管理→配置模型→新增模型→填写表单提交时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/ai/model/update` | PUT | 更新模型参数/状态 | `web/core/ai/config.ts:25` → `ModelConfigTable.tsx:261`（更新开关/删除）→ `AddModelBox.tsx`（编辑保存） | 账户→模型管理→配置模型→切换启用开关时调用；账户→模型管理→配置模型→编辑模型保存时调用 |
| `/api/core/ai/model/updateWithJson` | PUT | 全量覆盖模型配置 | `web/core/ai/config.ts:32` → `ModelConfigTable.tsx:574` | 账户→模型管理→配置模型→root→JSON 编辑器确认覆盖时调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/ai/model/delete` | DELETE | 删除自定义模型 | `web/core/ai/config.ts:29` → `ModelConfigTable.tsx:280` | 账户→模型管理→配置模型→点击删除→确认弹窗确认时调用 |

## 测试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/ai/model/test` | GET | 测试模型连通性 | `web/core/ai/config.ts:35` → `ModelConfigTable.tsx:257` | 账户→模型管理→配置模型→点击测试图标时调用 |

## 权限/协作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `getModelCollaborators` | — | 获取模型协作者列表 | `web/common/system/api.ts` → `ModelConfigTable.tsx:479` | 账户→模型管理→配置模型→点击权限钥匙图标→打开协作者弹窗时调用 |
| `updateModelCollaborators` | — | 更新模型协作者 | `web/common/system/api.ts` → `ModelConfigTable.tsx:480` | 账户→模型管理→配置模型→协作者弹窗→修改协作者提交时调用 |

---

## API 调用链追踪

### `/api/core/ai/model/list` 调用链

```
ModelConfigTable (useRequest getSystemModelList)
  ├── 触发: 组件挂载时自动调用；操作成功后调用 refreshModels 重新请求
  ├── 参数: 无（POST 空 body）
  └── 响应处理: 存入 systemModelList state → useMemo 按类型分组格式化 → 关联供应商信息 → 排序 → 前端筛选 → 渲染表格
```

### `/api/core/ai/model/detail` 调用链

```
ModelConfigTable (onEditModel)
  ├── 触发: 点击模型行编辑图标
  ├── 参数: { id: string }
  └── 响应处理: onSuccess 回调中 setEditModelData(data) → 触发 ModelEditModal 渲染
```

### `/api/core/ai/model/create` 调用链

```
ModelEditModal → postSystemModel
  ├── 触发: 在模型编辑弹窗中填写表单后点击确认（新建模式）
  ├── 参数: CreateModelBody（discriminated union，按模型类型提交 LLM/Embedding/TTS/STT/Rerank 对应字段）
  └── 响应处理: onSuccess → 调用父组件传入的 onSuccess 回调 → refreshModels → 关闭弹窗
```

### `/api/core/ai/model/update` 调用链

```
调用方 A: ModelConfigTable (updateModel — 启用/禁用开关)
  ├── 触发: 用户切换激活开关
  ├── 参数: { id: string, isActive: boolean }
  └── 响应处理: onSuccess → refreshModels；onError → 409+references 弹出 ModelReferenceModal；409+message toast 提示

调用方 B: ModelEditModal → putSystemModel（编辑保存）
  ├── 触发: 在模型编辑弹窗中修改参数后点击确认（编辑模式）
  ├── 参数: UpdateModelBody（含 id + 需更新的字段）
  └── 响应处理: onSuccess → refreshModels → 关闭弹窗；onError 同上
```

### `/api/core/ai/model/delete` 调用链

```
ModelConfigTable (deleteModel)
  ├── 触发: 点击删除图标 → PopoverConfirm 确认
  ├── 参数: { id: string }
  └── 响应处理: onSuccess → refreshModels；onError → 409+references 弹出 ModelReferenceModal
```

### `/api/core/ai/model/test` 调用链

```
ModelConfigTable (onTestModel)
  ├── 触发: 点击模型行的测试图标
  ├── 参数: { id: string }
  └── 响应处理: successToast → t('common:Success')
```

### `/api/core/ai/model/getConfigJson` 调用链

```
ModelConfigTable → JsonConfigModal (useRequest getModelConfigJson)
  ├── 触发: root 用户点击「配置文件」按钮
  ├── 参数: 无
  └── 响应处理: onSuccess → setData(res) → 填充 JSON 编辑器
```

### `/api/core/ai/model/updateWithJson` 调用链

```
ModelConfigTable → JsonConfigModal (useRequest putUpdateWithJson)
  ├── 触发: root 用户在 JSON 编辑器中确认覆盖（经二次确认）
  ├── 参数: { config: string }
  └── 响应处理: onSuccess → onClose + onSuccess（刷新列表）
```
