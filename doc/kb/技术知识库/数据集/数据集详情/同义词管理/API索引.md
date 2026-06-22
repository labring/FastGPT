---
capability_label: 同义词管理
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T12:00:00.000Z
parent_module: 数据集详情
roles: [管理员, 成员]
router_paths: [/dataset/detail?currentTab=synonym]
---

# 同义词管理 — API索引

## 文件查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/dataset/synonym/list` | GET | 获取同义词文件列表 | `api.ts:618` → `Synonym/index.tsx:289` | 同义词管理→同义词Tab→页面加载时调用 |

## 文件上传

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/dataset/synonym/upload` | POST | 上传同义词文件 | `api.ts:584` → `Synonym/index.tsx:326` | 同义词管理→同义词Tab→选择文件后上传时调用 |

## 文件下载

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/dataset/synonym/download` | GET | 下载同义词文件 | `Synonym/index.tsx:375`（通过 downloadFetch） | 同义词管理→同义词Tab→点击下载按钮时调用 |

## 文件删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/dataset/synonym/delete` | DELETE | 删除同义词文件 | `api.ts:635` → `Synonym/index.tsx:282,403` | 同义词管理→同义词Tab→确认删除弹窗后调用 |

---

## API 调用链追踪

### `/api/core/dataset/synonym/list` 调用链

```
SynonymTab 组件
  ├── 触发: 页面加载时（useEffect 自动调用 fetchSynonymFiles）
  ├── 参数: datasetId（从 DatasetPageContext 获取）
  └── 响应处理: 取 response.files[0] 设置到 synonymFile 状态；错误时 toast 提示"获取同义词文件失败"

SynonymTab 组件（上传成功后刷新）
  ├── 触发: 文件上传成功后调用 fetchSynonymFiles 刷新列表
  ├── 参数: datasetId（同首次加载）
  └── 响应处理: 同上
```

### `/api/core/dataset/synonym/upload` 调用链

```
SynonymTab 组件 → handleFileSelectorChange
  ├── 触发: 用户选择/拖拽文件到 FileSelector 组件
  ├── 参数:
  │   ├── datasetId（从 DatasetPageContext 获取）
  │   ├── file（File 对象，multipart/form-data）
  │   └── onProgress（上传进度回调，可选）
  ├── 中间状态: setIsUploading(true) → 显示上传中的文件条目（带 spinner）
  └── 响应处理:
      ├── 成功: 调用 fetchSynonymFiles 刷新 → toast 提示"同义词文件上传成功"
      └── 失败: 设置 uploadedFile.status='failed' + errorMessage → toast 提示"同义词文件上传失败"
```

### `/api/core/dataset/synonym/download` 调用链

```
SynonymTab 组件 → handleFileDownload
  ├── 触发: 用户点击已上传文件的下载图标
  ├── 参数: id（同义词文件 _id，从 synonymFile._id 获取）
  ├── 下载方式: 通过 downloadFetch 工具函数，浏览器端触发文件下载
  └── 响应处理:
      ├── 成功: toast 提示"同义词文件下载已开始"
      └── 失败: toast 提示"同义词文件下载失败"
```

### `/api/core/dataset/synonym/delete` 调用链

```
SynonymTab 组件 → handleDeleteConfirmClick
  ├── 触发: 用户点击删除图标 → Popover 确认弹窗 → 点击"删除"按钮
  ├── 参数:
  │   ├── datasetId（从 DatasetPageContext 获取）
  │   └── fileId（同义词文件 _id）
  ├── 前置确认: Popover 弹窗显示"确认删除该同义词文件？"（dataset:synonym_confirm_delete）
  └── 响应处理:
      ├── 成功: setSynonymFile(null) → 回退到空状态 → toast "删除成功"（dataset:synonym_delete_success）
      └── 失败: 通过 useRequest 的 onError 默认处理
```
