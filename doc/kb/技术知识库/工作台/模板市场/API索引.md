---
capability_label: 模板市场
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T10:30:00.000Z
parent_module: 工作台
roles: [所有登录用户]
router_paths: [/dashboard/templateMarket]
---

# 模板市场 — API索引

> API 定义位于 `projects/app/src/web/core/app/api/template.ts` 和 `projects/app/src/web/core/app/api.ts`。

## 模板查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/template/list | GET | 获取模板市场列表 | template.ts:7 → DashboardContainer.tsx:715 | 工作台→模板市场→加载时调用（currentTab 为 app_templates 时） |
| /proApi/core/app/template/getTemplateTypes | GET | 获取模板分类标签列表（Plus版） | template.ts:15 → DashboardContainer.tsx:695 | 工作台→模板市场→加载时调用（Plus 版系统） |
| /core/app/template/detail | GET | 获取单个模板详情（含工作流） | template.ts:11 → index.tsx:51 | 工作台→模板市场→点击"使用"按钮→创建前获取模板详情 |

## 应用创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/app/create | POST | 从模板创建新应用 | api.ts:34 → index.tsx:64 | 工作台→模板市场→获取模板详情后→提交创建应用 |

## API 调用链追踪

### `/core/app/template/list` 调用链

```
DashboardContainer (Container.tsx:715)
  ├── 触发: 切换到模板市场 Tab 时自动请求
  ├── 参数: { type: undefined }（获取全部模板）
  └── 响应处理: 前端过滤隐藏指定模板 ID（以 -assistant 结尾），传给 TemplateMarket 组件渲染

TemplateMarket (index.tsx)
  └── 接收: templateList 通过 DashboardContainer render props 注入
```

### `/proApi/core/app/template/getTemplateTypes` 调用链

```
DashboardContainer (Container.tsx:695)
  ├── 触发: 切换到模板市场 Tab 时自动请求（仅 Plus 版）
  ├── 参数: 无
  └── 响应处理: 前端注入推荐/企业微信专区标签到列表首位；社区版使用默认标签 defaultTemplateTypes

TemplateMarket (index.tsx)
  └── 接收: templateTags 通过 DashboardContainer render props 注入，用于构建分类 Tab 列表
```

### `/core/app/template/detail` 调用链

```
TemplateMarket → onUseTemplate (index.tsx:51)
  ├── 触发: 用户点击模板卡片"使用"按钮
  ├── 参数: templateId（模板 ID 字符串）
  ├── 顺序: 在 POST /core/app/create 之前串行调用
  └── 响应处理: 
      - 模板类型为 simple → 调用 form2AppWorkflow 将表单转为工作流结构
      - 其他类型 → 直接使用模板 workflow 数据
      - 作为 POST /core/app/create 的 modules/edges/chatConfig 参数来源

TemplateMarket → onUseTemplate (index.tsx:64)
  └── 后续: postCreateApp 使用 templateDetail 构建创建参数
```

### `/core/app/create` 调用链

```
TemplateMarket → onUseTemplate (index.tsx:64)
  ├── 触发: 获取模板详情后自动调用
  ├── 参数:
  │   - parentId: 从 URL query 参数获取
  │   - avatar: 模板头像
  │   - name: 模板名称
  │   - type: 模板类型
  │   - modules: 模板工作流 nodes
  │   - edges: 模板工作流 edges
  │   - chatConfig: 模板工作流 chatConfig
  │   - templateId: 模板 ID
  ├── 成功: 显示"创建成功"Toast → 埋点 webPushTrack.useAppTemplate → 跳转 /app/detail?appId={id}
  └── 失败: 显示"创建失败"Toast，遮罩解除
```
