# 模型配置严格校验与历史数据清洗

## 背景

模型配置写入接口当前只做 TypeScript 类型声明或少量手工检查，MongoDB 的 `metadata` 也是普通对象。前端还会把部分空值转换为 `''`，导致数字、布尔值和 `priceTiers` 以字符串形式进入数据库，并在系统初始化响应严格校验时失败。

## 目标

- 所有常规模型配置写入在落库前通过统一的判别联合 Schema。
- Schema 只填充有明确语义的默认值：Embedding `weight=0`；新版协议中的 `functionCall` 为可选字段。
- 前端不再用空字符串表示缺失的可选字段。
- 提供管理员历史数据清洗接口，默认 dry-run，无法确定修复方式的数据跳过并报告。
- 运行时模型加载不承担通用脏数据转换，仅适配插件协议中明确存在的字段差异，例如将 LLM 的 `maxTemperature=null` 统一为字段缺失。

## 设计

### 统一模型 Schema

在 `packages/global/core/ai/model.schema.ts` 导出 `SystemModelItemSchema`，以 `type` 为判别字段组合 LLM、Embedding、TTS、STT 和 Rerank Schema。模型保存、JSON 导入和初始化响应复用该 Schema。

严格 Schema 不接受数字字符串、布尔字符串或字符串形式的数组。缺失的 `weight` 通过 Schema 默认值补齐，`functionCall` 保持可选，解析后的对象才允许写入数据库。

### 写入接口

- `update`：使用 `parseApiInput` 校验请求外层结构；合并系统模型、历史配置和本次修改后，再用 `SystemModelItemSchema.parse` 校验完整结果。
- `updateWithJson`：校验 `config` 是 JSON 字符串，对解析后的每条记录统一覆盖可信的 `metadata.model`，补齐空名称，再严格解析完整模型后进入事务。
- 空成功响应统一为 `z.undefined()`。

### 前端

提交前删除 `null`、`undefined` 和 `NaN` 字段，不再转换成 `''`。用户实际输入的空字符串仍由严格接口拒绝。

### 清洗接口

管理员 `dataClean` 接口扫描 `system_models`：

- 合法数字字符串转换为 number；非法的可选数字字段删除，非法或缺失的必填数字字段使用系统默认值。
- JSON 字符串形式的 `priceTiers` 转为数组，并校验每个梯度。
- 缺失的 `weight` 使用统一 Schema 默认值，不补写可选的 `functionCall`。
- 最终必须通过 `SystemModelItemSchema`；无法修复的记录不更新，只输出字段路径和原因。
- 默认 dry-run；显式传入 `dryRun=false` 才通过一次 `bulkWrite` 写库，可重复执行。
- 每次正式执行都立即触发统一的系统模型缓存重载；即使数据已清洗完成，也可通过重复执行重新构建运行时缓存。

## TODO

- [x] 导出统一模型判别联合与默认值。
- [x] 改造模型更新和 JSON 导入接口。
- [x] 修正前端空值提交行为。
- [x] 实现管理员历史模型配置清洗接口。
- [x] 补充 Schema、接口和清洗测试。
- [x] 运行定向测试、类型检查、lint 和差异检查。
