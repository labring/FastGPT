# FastGPT 评估任务 API 文档

## 概述

FastGPT 评估任务 API 提供了完整的评估任务管理功能，包括任务创建、执行、监控和结果导出等操作。所有 API 都需要团队认证。

**基础 URL**: `/api/core/evaluation/task`

**认证方式**: Bearer Token (团队认证)

---

## 评估任务管理 API

### 1. 创建评估任务

创建一个新的评估任务，包含数据集、目标和评估指标的配置。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/create`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| name | string | 是 | 评估任务名称 |
| description | string | 否 | 评估任务描述 |
| datasetId | string | 是 | 评估数据集ID |
| target | EvalTarget | 是 | 评估目标配置 |
| metricIds | string[] | 是 | 评估指标ID数组 |

**EvalTarget 结构**
```typescript
{
  type: "workflow",  // 目前仅支持 workflow
  config: {
    appId: string    // 应用ID
  }
}
```

**请求示例**
```json
{
  "name": "客服机器人评估",
  "description": "测试客服机器人的回答质量",
  "datasetId": "64a1b2c3d4e5f6789012345a",
  "target": {
    "type": "workflow",
    "config": {
      "appId": "64a1b2c3d4e5f6789012345b"
    }
  },
  "metricIds": [
    "64a1b2c3d4e5f6789012345c",
    "64a1b2c3d4e5f6789012345d"
  ]
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| _id | string | 评估任务ID |
| name | string | 任务名称 |
| description | string | 任务描述 |
| datasetId | string | 数据集ID |
| target | EvalTarget | 评估目标 |
| metricIds | string[] | 指标ID数组 |
| status | number | 任务状态 (1=排队, 2=评估中, 3=完成, 4=错误) |
| createTime | string | 创建时间 |
| teamId | string | 团队ID |
| tmbId | string | 创建者ID |
| usageId | string | 用量记录ID |

**返回示例**
```json
{
  "_id": "64a1b2c3d4e5f6789012345e",
  "name": "客服机器人评估",
  "description": "测试客服机器人的回答质量",
  "datasetId": "64a1b2c3d4e5f6789012345a",
  "target": {
    "type": "workflow",
    "config": {
      "appId": "64a1b2c3d4e5f6789012345b"
    }
  },
  "metricIds": [
    "64a1b2c3d4e5f6789012345c",
    "64a1b2c3d4e5f6789012345d"
  ],
  "status": 1,
  "createTime": "2024-01-15T08:30:00.000Z",
  "teamId": "64a1b2c3d4e5f6789012345f",
  "tmbId": "64a1b2c3d4e5f6789012346a",
  "usageId": "64a1b2c3d4e5f6789012346b"
}
```

---

### 2. 删除评估任务

删除指定的评估任务及其所有相关的评估项，并清理队列中的相关任务。

**请求信息**
- **方法**: `DELETE`
- **URL**: `/api/core/evaluation/task/delete`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evalId | string | 是 | 评估任务ID |

**请求示例**
```json
{
  "evalId": "64a1b2c3d4e5f6789012345e"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation deleted successfully"
}
```

---

### 3. 更新评估任务

更新评估任务的基本信息。

**请求信息**
- **方法**: `PUT`
- **URL**: `/api/core/evaluation/task/update`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evaluationId | string | 是 | 评估任务ID |
| name | string | 否 | 更新的任务名称 |
| description | string | 否 | 更新的任务描述 |

**请求示例**
```json
{
  "evaluationId": "64a1b2c3d4e5f6789012345e",
  "name": "客服机器人评估 v2",
  "description": "更新后的评估任务描述"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation updated successfully"
}
```

---

### 4. 查询评估任务

获取指定评估任务的详细信息。

**请求信息**
- **方法**: `GET`
- **URL**: `/api/core/evaluation/task/detail`
- **参数**: Query 参数

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 评估任务ID |

**请求示例**
```
GET /api/core/evaluation/task/detail?id=64a1b2c3d4e5f6789012345e
```

**返回参数**

与创建评估任务返回的参数结构相同，但可能包含更多运行时信息：

| 参数名 | 类型 | 描述 |
|--------|------|------|
| finishTime | string | 完成时间 |
| avgScore | number | 平均分数 |
| errorMessage | string | 错误信息 |

**返回示例**
```json
{
  "_id": "64a1b2c3d4e5f6789012345e",
  "name": "客服机器人评估",
  "status": 3,
  "createTime": "2024-01-15T08:30:00.000Z",
  "finishTime": "2024-01-15T09:15:00.000Z",
  "avgScore": 85.6,
  "errorMessage": null
}
```

---

### 5. 列表评估任务

获取评估任务列表，支持分页和搜索功能。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/list`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| pageNum | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页条数（最大100） |
| searchKey | string | 否 | - | 搜索关键字 |

**请求示例**
```json
{
  "pageNum": 1,
  "pageSize": 20,
  "searchKey": "客服"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| list | EvaluationDisplayType[] | 评估任务列表 |
| total | number | 总数量 |

**EvaluationDisplayType 结构**
```typescript
{
  _id: string;
  name: string;
  createTime: string;
  finishTime?: string;
  status: number;
  errorMessage?: string;
  avgScore?: number;
  datasetName: string;
  targetName: string;
  metricNames: string[];
  executorName: string;
  executorAvatar: string;
  totalCount: number;
  completedCount: number;
  errorCount: number;
}
```

**返回示例**
```json
{
  "list": [
    {
      "_id": "64a1b2c3d4e5f6789012345e",
      "name": "客服机器人评估",
      "createTime": "2024-01-15T08:30:00.000Z",
      "finishTime": "2024-01-15T09:15:00.000Z",
      "status": 3,
      "avgScore": 85.6,
      "datasetName": "客服测试数据集",
      "targetName": "Workflow: 64a1b2c3d4e5f6789012345b",
      "metricNames": ["语义准确性", "回答完整性"],
      "executorName": "张三",
      "executorAvatar": "/avatar/user1.jpg",
      "totalCount": 100,
      "completedCount": 100,
      "errorCount": 0
    }
  ],
  "total": 1
}
```

---

### 6. 启动评估任务

启动排队状态的评估任务，将其提交到执行队列。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/start`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evaluationId | string | 是 | 评估任务ID |

**请求示例**
```json
{
  "evaluationId": "64a1b2c3d4e5f6789012345e"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation started successfully"
}
```

---

### 7. 停止评估任务

停止正在执行或排队的评估任务。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/stop`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evaluationId | string | 是 | 评估任务ID |

**请求示例**
```json
{
  "evaluationId": "64a1b2c3d4e5f6789012345e"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation stopped successfully"
}
```

---

### 8. 重试评估任务失败项

批量重试评估任务中失败的评估项。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/retryFailed`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evaluationId | string | 是 | 评估任务ID |

**请求示例**
```json
{
  "evaluationId": "64a1b2c3d4e5f6789012345e"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |
| retryCount | number | 重试的评估项数量 |

**返回示例**
```json
{
  "message": "Failed items retry started successfully",
  "retryCount": 5
}
```

---

## 评估项管理 API

### 9. 删除评估项

删除指定的评估项。

**请求信息**
- **方法**: `DELETE`
- **URL**: `/api/core/evaluation/task/item/delete`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evalItemId | string | 是 | 评估项ID |

**请求示例**
```json
{
  "evalItemId": "64a1b2c3d4e5f6789012346c"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation item deleted successfully"
}
```

---

### 10. 更新评估项

更新评估项的信息。

**请求信息**
- **方法**: `PUT`
- **URL**: `/api/core/evaluation/task/item/update`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evalItemId | string | 是 | 评估项ID |
| dataItem | object | 否 | 数据项更新 |
| response | string | 否 | 回答更新 |
| score | number | 否 | 分数更新 |

**请求示例**
```json
{
  "evalItemId": "64a1b2c3d4e5f6789012346c",
  "response": "更新后的回答内容",
  "score": 90.5
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation item updated successfully"
}
```

---

### 11. 查询评估项

获取指定评估项的详细信息。

**请求信息**
- **方法**: `GET`
- **URL**: `/api/core/evaluation/task/item/detail`
- **参数**: Query 参数

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evalItemId | string | 是 | 评估项ID |

**请求示例**
```
GET /api/core/evaluation/task/item/detail?evalItemId=64a1b2c3d4e5f6789012346c
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| item | EvalItemSchemaType | 评估项基础信息 |
| dataItem | object | 数据项信息 |
| response | string | AI 回答 |
| metricResults | MetricResult[] | 指标评估结果 |
| score | number | 综合分数 |

**MetricResult 结构**
```typescript
{
  metricId: string;
  metricName: string;
  score: number;
  details?: object;
  error?: string;
}
```

**返回示例**
```json
{
  "item": {
    "_id": "64a1b2c3d4e5f6789012346c",
    "evalId": "64a1b2c3d4e5f6789012345e",
    "status": 3,
    "finishTime": "2024-01-15T09:10:00.000Z"
  },
  "dataItem": {
    "userInput": "如何重置密码？",
    "expectedOutput": "点击登录页面的忘记密码链接即可重置"
  },
  "response": "您可以通过点击登录页面的忘记密码链接来重置密码",
  "metricResults": [
    {
      "metricId": "64a1b2c3d4e5f6789012345c",
      "metricName": "语义准确性",
      "score": 88.5,
      "details": {}
    },
    {
      "metricId": "64a1b2c3d4e5f6789012345d",
      "metricName": "回答完整性",
      "score": 92.0,
      "details": {}
    }
  ],
  "score": 90.25
}
```

---

### 12. 列表评估项

获取指定评估任务的评估项列表，支持分页。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/item/list`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| evalId | string | 是 | - | 评估任务ID |
| pageNum | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页条数（最大100） |

**请求示例**
```json
{
  "evalId": "64a1b2c3d4e5f6789012345e",
  "pageNum": 1,
  "pageSize": 20
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| list | EvaluationItemDisplayType[] | 评估项列表 |
| total | number | 总数量 |

**EvaluationItemDisplayType 结构**
```typescript
{
  _id: string;
  evalItemId: string;
  evalId: string;
  dataItem: {
    userInput: string;
    expectedOutput: string;
    context?: string[];
  };
  response?: string;
  status: number;
  score?: number;
  metricResults: MetricResult[];
  errorMessage?: string;
  finishTime?: string;
}
```

**返回示例**
```json
{
  "list": [
    {
      "_id": "64a1b2c3d4e5f6789012346c",
      "evalItemId": "64a1b2c3d4e5f6789012346c",
      "evalId": "64a1b2c3d4e5f6789012345e",
      "dataItem": {
        "userInput": "如何重置密码？",
        "expectedOutput": "点击登录页面的忘记密码链接即可重置"
      },
      "response": "您可以通过点击登录页面的忘记密码链接来重置密码",
      "status": 3,
      "score": 90.25,
      "metricResults": [
        {
          "metricId": "64a1b2c3d4e5f6789012345c",
          "metricName": "语义准确性",
          "score": 88.5
        }
      ],
      "finishTime": "2024-01-15T09:10:00.000Z"
    }
  ],
  "total": 100
}
```

---

### 13. 重试评估项

重试指定的单个评估项，适用于失败或有错误的评估项。

**请求信息**
- **方法**: `POST`
- **URL**: `/api/core/evaluation/task/item/retry`
- **Content-Type**: `application/json`

**请求参数**

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| evalItemId | string | 是 | 评估项ID |

**请求示例**
```json
{
  "evalItemId": "64a1b2c3d4e5f6789012346c"
}
```

**返回参数**

| 参数名 | 类型 | 描述 |
|--------|------|------|
| message | string | 操作结果信息 |

**返回示例**
```json
{
  "message": "Evaluation item retry started successfully"
}
```

**注意事项**
- 只有失败状态或有错误信息的评估项可以重试
- 已完成且无错误的评估项不能重试
- 重试会重置评估项状态并重新提交到执行队列
- 重试操作会清除之前的错误信息和结果

---

### 14. 导出评估项

导出评估任务的所有评估项结果，支持 JSON 和 CSV 格式。

**请求信息**
- **方法**: `GET`
- **URL**: `/api/core/evaluation/task/item/export`
- **参数**: Query 参数

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| evalId | string | 是 | - | 评估任务ID |
| format | string | 否 | json | 导出格式 (json/csv) |

**请求示例**
```
GET /api/core/evaluation/task/item/export?evalId=64a1b2c3d4e5f6789012345e&format=json
```

**返回参数**

返回二进制文件内容，Content-Type 根据格式设置：
- JSON: `application/json`
- CSV: `text/csv`

**JSON 导出示例**
```json
[
  {
    "itemId": "64a1b2c3d4e5f6789012346c",
    "userInput": "如何重置密码？",
    "expectedOutput": "点击登录页面的忘记密码链接即可重置",
    "response": "您可以通过点击登录页面的忘记密码链接来重置密码",
    "score": 90.25,
    "status": 3,
    "metricResults": [
      {
        "metricId": "64a1b2c3d4e5f6789012345c",
        "metricName": "语义准确性",
        "score": 88.5
      }
    ],
    "errorMessage": null,
    "responseTime": "2024-01-15T09:09:58.000Z",
    "finishTime": "2024-01-15T09:10:00.000Z"
  }
]
```

**CSV 导出示例**
```csv
ItemId,UserInput,ExpectedOutput,Response,Score,Status,ErrorMessage,ResponseTime,FinishTime
64a1b2c3d4e5f6789012346c,"如何重置密码？","点击登录页面的忘记密码链接即可重置","您可以通过点击登录页面的忘记密码链接来重置密码",90.25,3,,2024-01-15T09:09:58.000Z,2024-01-15T09:10:00.000Z
```

---

## 状态码说明

### 评估任务状态 (status)
- `1`: 排队 (queuing)
- `2`: 评估中 (evaluating)  
- `3`: 完成 (completed)
- `4`: 错误 (error)

### HTTP 状态码
- `200`: 成功
- `400`: 请求参数错误
- `401`: 认证失败
- `403`: 权限不足
- `404`: 资源不存在
- `500`: 服务器内部错误

---

## 错误响应格式

所有 API 在发生错误时返回统一格式：

```json
{
  "statusText": "error_code",
  "message": "错误详细信息"
}
```

**常见错误码**
- `token_error_code.403`: Token 无效或过期
- `aiPointsNotEnough`: AI Points 余额不足
- `evaluation_not_found`: 评估任务不存在
- `evaluation_item_not_found`: 评估项不存在
- `invalid_status`: 状态不允许此操作

---

## 使用注意事项

1. **认证**: 所有 API 都需要有效的团队认证 Token
2. **权限**: 只能访问所属团队的评估任务
3. **状态限制**: 某些操作只能在特定状态下进行
4. **并发控制**: 系统会自动处理评估项的并发执行
5. **资源清理**: 删除评估任务会自动清理相关资源和队列任务
6. **重试机制**: 失败的评估项支持重试，系统会自动处理重试逻辑

---

## SDK 使用示例 (JavaScript)

```javascript
// 创建评估任务
const evaluation = await fetch('/api/core/evaluation/task/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: '客服机器人评估',
    datasetId: 'dataset_id',
    target: {
      type: 'workflow',
      config: { appId: 'app_id' }
    },
    metricIds: ['metric_id_1', 'metric_id_2']
  })
}).then(res => res.json());

// 启动评估任务
await fetch('/api/core/evaluation/task/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    evaluationId: evaluation._id
  })
});

// 获取评估结果
const items = await fetch('/api/core/evaluation/task/item/list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    evalId: evaluation._id,
    pageNum: 1,
    pageSize: 20
  })
}).then(res => res.json());

// 重试失败的评估项（批量）
await fetch('/api/core/evaluation/task/retryFailed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    evaluationId: evaluation._id
  })
});

// 重试单个评估项
await fetch('/api/core/evaluation/task/item/retry', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    evalItemId: 'item_id_here'
  })
});
```