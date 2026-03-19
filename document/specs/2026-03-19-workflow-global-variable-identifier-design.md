# 工作流全局变量标识符优化设计

## 1. 背景

当前工作流设计器中的“应用配置 -> 系统配置 -> 全局变量”只允许用户修改变量的展示名称 `label`，不允许定义技术标识 `key`。  
现有实现会在创建变量时自动生成一个随机 `key`，后续工作流运行、变量引用、变量更新、聊天请求提交均依赖该 `key` 作为真实标识。

这套设计保证了“修改展示名不影响运行时引用”，但也带来明显问题：

- 用户无法定义语义化标识，例如 `customer_name`、`start_date`
- API 调试、变量排查、外部系统对接时只能面对随机 key，可读性差
- 变量配置缺少“显示名”和“技术标识”的明确分层，产品心智不清晰

## 2. 问题定义

### 2.1 当前实现事实

- 变量新增时，若没有 `key`，前端会自动生成 `getNanoid(8)` 作为内部标识
- 变量编辑弹窗未暴露 `key` 输入项，只提供 `label`
- 工作流中的全局变量引用统一使用 `key`
- 聊天运行时提交变量时，提交对象使用 `item.key` 作为字段名
- 为兼容历史或外部输入，聊天上下文存在 `variables[item.label]` 回退逻辑

### 2.2 根因分析

当前产品模型实际上把变量设计成：

- `label`: 展示层文案，可变
- `key`: 内部运行时 ID，稳定，不暴露

因此“不能编辑 key”不是缺陷实现，而是一个显式的稳定性策略。  
但该策略忽略了变量作为“对外输入契约”的一面，导致用户无法控制接口级标识。

## 3. 设计目标

### 3.1 目标

方案 A 的目标是：

1. 允许用户在创建变量时定义一个可读、稳定的技术标识 `key`
2. 保持当前运行时引用稳定，不引入自动迁移复杂度
3. 不修改数据库结构，不引入新的持久化字段
4. 尽量复用现有 `chatConfig.variables[].key` 能力
5. 在 UI 上明确区分“变量名”和“变量标识符”

### 3.2 非目标

本方案不解决以下问题：

- 不支持任意时刻自由重命名 `key`
- 不做历史工作流引用自动迁移
- 不引入变量别名 `aliases`
- 不调整运行时引用结构 `[VARIABLE_NODE_ID, key]`

## 4. 设计原则

- 稳定性优先：一旦变量进入工作流引用链路，技术标识应尽量稳定
- 心智清晰：用户可区分“展示给人看”和“系统内部/接口使用”的字段
- 兼容优先：老数据继续可用，不强制迁移
- 最小改造：复用现有 schema 与保存接口，避免扩大改动面

## 5. 方案概述

### 5.1 方案描述

为全局变量新增“变量标识符 / Identifier”编辑能力：

- 创建变量时：
  - 默认根据 `label` 自动生成 slug 风格的 `key`
  - 用户可手动修改 `key`
- 保存成功后：
  - `key` 进入只读状态
  - 后续仅允许编辑 `label`、类型、默认值、描述等属性
- 变量列表页：
  - 同时展示 `label` 与 `key`
  - `key` 支持复制

### 5.2 用户心智

- `label`: 展示名称，面向业务人员
- `key`: 技术标识，面向工作流引用/API/调试

建议在 UI 上采用如下命名：

- 变量名称：`label`
- 变量标识符：`key`

## 6. 交互设计

### 6.1 创建变量

变量弹窗新增“变量标识符”输入框，位于“变量名称”下方。

默认行为：

1. 用户首次输入 `label`
2. 系统自动生成默认 `key`
3. 若用户手动编辑过 `key`，后续不再自动覆盖

建议 slug 规则：

- 全部转小写
- 中文、空格、特殊字符统一转为 `-`
- 连续分隔符合并为单个 `_` 或 `-`
- 推荐最终采用下划线风格：`customer_name`
- 首字符若不是字母，前置 `var_`
- 长度限制建议 2 到 50

示例：

- `Customer Name` -> `customer_name`
- `开始日期` -> `var_start_date` 或 `start_date`
- `1号客户` -> `var_1_customer`

注：中文转拼音需要额外依赖，方案 A 不强依赖。若不引入拼音库，则中文场景使用通用回退前缀，如 `var_xxx` 不是理想体验。更务实的做法是：

- 默认仍使用 `var_<nanoid>`
- 当用户输入英文/数字/空格时自动 slug
- 对中文提示“建议填写英文标识符”

### 6.2 编辑变量

已存在变量打开编辑弹窗时：

- `label` 可编辑
- `key` 只读展示
- 展示提示文案：
  - “变量标识符用于工作流引用与接口传参，创建后不可修改”

如果后续需要开放“未引用时可编辑 key”，应作为方案 B 单独演进。

### 6.3 变量列表

当前列表页仅展示变量名称和必填状态。建议升级为：

- 第一列：变量名称 `label`
- 第二列：标识符 `key`
- 第三列：必填/类型
- 第四列：操作

同时在 `key` 旁提供复制按钮，降低调试成本。

## 7. 校验规则

### 7.1 label 校验

沿用当前逻辑：

- 不允许为空
- 不允许与其他变量 `label` 重复
- 不允许与系统变量的 `key/label` 冲突

### 7.2 key 校验

新增规则：

- 必填
- 仅允许 `[a-zA-Z][a-zA-Z0-9_]{1,49}` 或等价规则
- 不允许与其他变量 `key` 重复
- 不允许与系统变量 `key` 冲突
- 建议保留关键字黑名单：
  - `userId`
  - `appId`
  - `chatId`
  - `responseChatItemId`
  - `histories`
  - `cTime`

错误文案建议：

- 标识符不能为空
- 标识符只能包含字母、数字和下划线，且必须以字母开头
- 标识符已存在
- 标识符与系统变量冲突

## 8. 数据模型设计

### 8.1 现有模型

现有 `VariableItemType` 已包含：

- `key`
- `label`
- `type`
- `description`
- `required`
- `defaultValue`
- 其他输入组件配置

因此方案 A 不需要新增字段，仅调整字段语义和前端交互。

### 8.2 保存模型

应用保存接口已直接透传 `chatConfig`，因此变量 `key` 只要由前端按目标规则写入即可被持久化。  
数据库无需 migration，接口契约无需变更。

## 9. 技术设计

### 9.1 前端改造点

#### 变量编辑弹窗

文件：

- `projects/app/src/components/core/app/VariableEditModal/index.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.tsx`

改造点：

- 新增 `key` 字段输入/展示
- 创建态允许编辑 `key`
- 编辑态只读展示 `key`
- 增加 `label -> key` 的默认生成逻辑
- 增加 key 校验

#### 变量校验工具

文件：

- `projects/app/src/components/core/app/utils/formValidation.ts`

改造点：

- 保留现有 `label` 校验方法
- 新增 `validateFieldKey`
- 将系统变量冲突校验从“名称语义”拆成“label 冲突”和“key 冲突”两套逻辑

#### 变量列表展示

文件：

- `projects/app/src/components/core/app/VariableEdit.tsx`

改造点：

- 新增 `key` 列
- 增加复制按钮
- 列表展示中弱化随机 key 的“脏数据感”

### 9.2 后端改造点

理论上可不改后端。  
但从防御性设计出发，建议在应用更新入库前增加一层变量校验，避免非法 key 通过前端绕过直接写库。

候选位置：

- `projects/app/src/pages/api/core/app/update.ts`
- `@fastgpt/service/core/app/controller` 内部预处理逻辑

建议后端最少校验：

- `chatConfig.variables[].key` 格式是否合法
- 是否与同 app 内其它变量重复
- 是否与系统变量 key 冲突

### 9.3 运行时影响

方案 A 不调整运行时读取逻辑。

以下行为保持不变：

- 变量引用仍走 `key`
- 变量更新节点仍按 `key` 查找变量定义
- 聊天请求仍按 `key` 组装 `requestVariables`

因此运行时风险较低。

## 10. 兼容策略

### 10.1 老数据兼容

已有变量数据继续保留原随机 key，不做批量迁移。

表现为：

- 老变量编辑时可以看到只读 `key`
- 新变量从该版本开始支持自定义 `key`

### 10.2 聊天兼容

现有聊天上下文里存在：

- 优先读 `variables[item.key]`
- 其次读 `variables[item.label]`

该逻辑建议短期保留，不在方案 A 中删除。  
原因：

- 防止历史分享链接、旧调用方式、外部输入仍按 label 传值时立即失效
- 兼容窗口可延续 1 到 2 个大版本

### 10.3 文档兼容

需要同步更新：

- 工作流变量说明
- 若有对外 API 文档，明确建议使用 `key` 传参

## 11. 风险分析

### 11.1 主要风险

- 用户创建时随意填写无语义或不规范 `key`
- 中英文 slug 策略不清晰，导致自动生成体验不一致
- 前端校验与后端校验不一致，出现“前端能保存/后端不能保存”或反之

### 11.2 风险控制

- 采用严格正则限制 key 格式
- 默认生成仅做辅助，不强求完美中文转义
- 后端补最小校验，确保数据不会被污染

## 12. 验收标准

### 12.1 功能验收

- 创建全局变量时可填写 `key`
- 未填写时系统能生成默认 `key`
- 已存在变量编辑时只能查看、不能修改 `key`
- 变量列表中可以看到 `key`
- 工作流引用和运行时行为不受影响

### 12.2 兼容验收

- 老应用打开后变量配置不报错
- 老变量引用不失效
- 聊天测试、日志回放、变量更新节点行为不回归

### 12.3 校验验收

- 重复 key 被拦截
- 系统变量冲突被拦截
- 非法字符 key 被拦截

## 13. 实施建议

建议分两期实施：

### 第一期

- 前端 UI 改造
- 前端 key 校验
- 变量列表展示 key
- 保持运行时与保存接口不变

### 第二期

- 后端增加防御性校验
- 补充文档和测试
- 视反馈决定是否推进“未引用变量允许改 key”的方案 B

## 14. 涉及文件

重点涉及：

- `projects/app/src/components/core/app/VariableEdit.tsx`
- `projects/app/src/components/core/app/VariableEditModal/index.tsx`
- `projects/app/src/components/core/app/utils/formValidation.ts`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.tsx`
- `projects/app/src/web/core/chat/context/chatItemContext.tsx`
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx`
- `projects/app/src/web/core/workflow/adapt.ts`
- `projects/app/src/web/core/workflow/utils.ts`
- `packages/global/core/workflow/runtime/utils.ts`
- `projects/app/src/pages/api/core/app/update.ts`

## 15. 结论

方案 A 的本质不是“放开修改运行时 key”，而是把现有已经存在的 `key` 正式提升为用户可控的技术标识，并限制其只在创建阶段可编辑。  

这是一个低风险、高收益的改造：

- 不改变底层引用模型
- 不要求迁移历史工作流
- 能显著提升全局变量在调试、集成、排障中的可用性

如果该方案通过评审，后续实现应以“创建时可定义、保存后只读、运行时完全兼容”为核心原则。
