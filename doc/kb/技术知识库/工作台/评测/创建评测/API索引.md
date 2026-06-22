---
capability_label: 创建评测
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:20:00.000Z"
parent_module: 评测
roles: [admin]
router_paths: ["/dashboard/evaluation/create"]
---

# 创建评测 — API索引

## 评测创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/create` | POST | 创建评测任务（含文件上传） | `web/core/evaluation/evaluation.ts:11` → `pages/dashboard/evaluation/create.tsx:79` | 工作台→评测→创建评测→提交创建表单时调用 |

**请求方式**: FormData 上传，包含文件（CSV）和 JSON 参数 `{name, evalModel, appId}`，超时 600s。

## 应用信息查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/detail` | GET | 获取应用详情（含变量配置） | `web/core/app/api.ts:45` → `pages/dashboard/evaluation/create.tsx:62` | 工作台→评测→创建评测→下载 CSV 模板时调用 |

**请求参数**: `appId={选中的应用ID}`

## API 调用链追踪

### `/core/evaluation/create` 调用链

```
EvaluationCreating (pages/dashboard/evaluation/create.tsx)
  ├── 触发: 用户点击"开始评测"按钮，通过 handleSubmit(onSubmit) 提交表单
  ├── 参数: FormData { file: CSV文件, data: JSON.stringify({ name, evalModel, appId }) }
  ├── 配置: timeout=600000, onUploadProgress 监听上传进度
  ├── 成功处理: toast 提示"评测任务创建成功"，router.push('/dashboard/evaluation')
  └── 错误处理:
       ├── evaluationFileErrors 匹配 → setError(error.message)，文件卡片变红显示校验详情
       ├── TeamErrEnum.aiPointsNotEnough → 弹出积分不足弹窗
       └── 其他错误 → toast 通用错误提示
```

### `/core/app/detail` 调用链

```
EvaluationCreating (pages/dashboard/evaluation/create.tsx)
  ├── 触发: 用户选择应用后点击"点击下载该应用的 CSV 模板"按钮
  ├── 参数: appId={选中的应用ID}
  ├── 成功处理: 提取 appDetail.chatConfig.variables，调用 getEvaluationFileHeader() 生成 CSV 表头，通过 fileDownload 触发浏览器下载
  └── 错误处理: errorToast 默认提示
```
