---
case_version: 1
id: "FG-APP-MANAGEMENT-001"
title: "应用引用知识库时正式发布校验索引模型且草稿可修复"
business: "app"
types: ["api", "ui", "integration"]
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database"]
sources:
  - "packages/global/openapi/core/app/version/api.ts"
  - "projects/app/src/pages/api/core/app/version/publish.ts"
  - "packages/service/core/app/resource/service.ts"
  - "packages/service/core/app/resource/utils.ts"
  - "packages/service/core/app/schema.ts"
  - "packages/service/core/app/version/schema.ts"
  - "packages/service/core/dataset/model.ts"
  - "packages/service/core/dataset/entity.ts"
  - "packages/service/support/permission/model/auth.ts"
  - "projects/app/src/components/core/app/DatasetSelectModal.tsx"
routes:
  - "POST /api/core/app/version/publish"
  - "POST /api/core/app/version/list"
  - "GET /api/core/app/version/latest"
related:
  - "FG-DATASET-INGESTION-001"
  - "FG-DATASET-RETRIEVAL-001"
  - "FG-MODEL-MANAGEMENT-001"
baseline: "3eca129944291a82acda9471201dccc5cb2525cf; pro=48ee04dd34d4d5b13e77ed4ce184124e491a765a"
---

# 应用引用知识库时正式发布校验索引模型且草稿可修复

## 用例简介

应用引用知识库后，正式发布需要同时保证其索引模型可用且当前发布者有使用权限。失效配置应允许保存草稿供用户修复，但不能让一次失败发布覆盖已有线上版本。

## 前置准备

- 独立团队 T、应用 W 和可读知识库 K1/K2，模型 E1/E2；A 对 W 有写权、对 K1/K2 有读权，正常情况下可使用 E1/E2。应用自身 LLM、其他功能、资源权限均有效，先成功发布 P0，记录 publishedVersionId。
- 从真实 UI 分别创建工作流、Agent、AgentV2 的最小知识库引用配置，保存各自合法 nodes/edges/chatConfig。按 UI 已开启的应用类型参数化，不臆造不存在的发布入口；各类型均使用同一 publish 路由。主链用一个类型，其余只验证资源引用能被提取和相同拒绝规则。
- publish query=`?appId=W`；body 沿用捕获配置并只改变 `isPublish`、`autoSave` 和 RUN 版本名。正式发布用 `isPublish:true,autoSave:false`；普通草稿 `isPublish:false,autoSave:false`；自动保存 `isPublish:false,autoSave:true`。
- 快照：`db.apps.findOne({_id:W},{teamId:1,publishedVersionId:1,scheduledTriggerConfig:1,scheduledTriggerNextTime:1,pluginData:1})`；`db.app_versions.find({appId:W},{isPublish:1,isAutoSave:1,nodes:1,resources:1,versionName:1})`。每行独立克隆 P0 基线，连续保存/发布在对应行明确说明。
- UI 选择从应用编辑页“知识库”选择弹窗进入，以 K 名称定位；查看用户可见的“索引模型缺失”类提示。模型权限对照保留知识库/应用已有资源基线，确保不是资源新增权限先拒绝。
- 每秒最多 30 秒轮询发布响应与 Mongo 快照；需要目录刷新时先确认模型停用/授权变更已在当前身份目录生效。root 跨团队场景单独用登录团队 R 与 W 所属团队 T，记录两边模型与资源 ID，不能把 R 当作 W 归属。
- 清理：通过产品恢复 P0 或删除本例 W，删除本例知识库并恢复模型权限。发布拒绝不要求审计或外层鉴权完全没有记录。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；P0，E1/E2正常 | W 引用 K1/K2，其中同一 K1 在两个位置出现；正式发布一次。 |
| C2 | 异常；恢复 P0 | K2 索引模型分别停用、删除，或仅撤销 A 的模型使用权；分别正式发布同一配置。 |
| C3 | 草稿边界；恢复 P0，E2停用 | 依次普通保存、自动保存失效知识库配置，再正式发布；确认每一步是否创建/更新版本及线上指针。 |
| C4 | 配置边界；恢复 P0 | E2 已启用且预警 true；正式发布，再把 K2 从应用配置中移除、停用 E2，再次发布。 |
| C5 | UI/服务端对照；恢复 P0，E2停用 | 新打开知识库选择弹窗尝试选 K2；同时用停用前捕获的合法配置直接发 publish 请求。 |
| C6 | 团队边界；root跨团队管理 | root 登录团队 R，管理 T 的 W；R 有健康默认模型，T 的 K2 仍引用失效 E2。修复 T 的 E2 后用同一 root 上下文再发布。 |

## 预期结果

公共断言：正式发布前对本次实际知识库引用检查模型存在、启用、类型和操作者权限；同一知识库重复引用不改变判定。拒绝时事务内正式版本、发布指针和定时配置不能部分更新。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/数据库 | HTTP 200/code=200/data=null；新正式版本 resources 包含正确 K1/K2，W.publishedVersionId 指向该新版本。 | 请求、版本差集、指针与资源列表。 |
| C2 | API/数据库 | 三种模型不可用原因均阻断；线上指针保持 P0，未插入本次正式版本，定时/插件发布指针不被本次失败请求改写。 | 模型/权限初态、业务错误与事务字段快照。 |
| C3 | API/数据库 | 普通保存与自动保存允许留下修复草稿，线上指针仍 P0；正式发布拒绝，不把草稿保存成功视作线上已变更。 | 三次响应、isAutoSave/isPublish 版本记录和指针。 |
| C4 | API/数据库 | 仅预警允许发布；移除失效知识库后不再因该未引用 K2 失败，resources 不残留本次已移除引用。 | 两次成功版本的资源精确集合。 |
| C5 | UI/API/数据库 | UI 明确提示并阻止新增选择；直接请求也被后端拒绝，不能靠前端拦截代替服务端校验。 | 可见提示、HAR、P0 指针与版本差集。 |
| C6 | API/数据库 | 使用 T 的知识库与模型目录校验，不能用 R 的健康模型覆盖失效引用；修复 T 后成功发布，所有资源仍属于 T。 | root身份、两团队模型快照、拒绝/成功对照。 |
