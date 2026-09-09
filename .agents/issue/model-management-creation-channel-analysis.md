# 模型新增、测试与渠道关联问题分析

分析日期：2026-09-09。代码基线：`0b9829d127`。

本次范围是用户最初反馈的 8 项问题及后续补充的知识库模型停用问题，包含代码追踪、隔离浏览器复现、实现和局部验证；浏览器验证只使用本地环境，未操作线上模型或渠道。

## 1. 结论与证据等级

| 编号 | 问题 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 新增时测试失败，保存后成功 | 草稿中的渠道选择尚未持久化，而当前测试仍走要求已有模型—渠道绑定的 AI Proxy 路由 | FastGPT 调用链与 AI Proxy v0.6.5 源码相互印证；未重新运行完整代理服务 |
| 2 | 空白创建重排模型出现 Data validation error | 可选 `config.maxToken` 留空被表单转成 NaN，JSON 转成 null，Schema 只接受 number 或 undefined | 真实 Chrome、当前 Chakra/RHF 与业务 Schema 最小复现 |
| 3 | 多模板创建关联不上渠道 | 与第 6 项复用同一渠道选择组件，复选框点击失效足以导致此现象；未发现按模型数量限制关联的分支 | 代码复用关系与真实 Chrome 事件复现；尚不能排除用户同时遇到提交后的其他问题 |
| 4 | 模板创建不能新增渠道 | 确实缺少创建入口、创建弹窗和回填渠道 ID 的状态流程 | 静态代码确认 |
| 5 | 管理渠道跳转没有丢失编辑确认 | 空白创建确定缺失；编辑已有确认，但存在 JSON 非法中间态未计入 dirty 的缺口 | 空白与编辑控制器、表单数据同步逻辑确认；用户具体编辑字段待补充 |
| 6 | 编辑内渠道复选框不能选中或取消 | 复选框外观点击冒泡到行，再由 label 激活 input，状态被反向切回；传给 Checkbox 的 onClick 在当前 Chakra 实现中被覆盖 | 真实 Chrome 最小复现，选中与取消均失败；外层阻止冒泡对照成功 |
| 7 | 部分模型无法批量选择 | 暂未确认；不能直接归并为第 6 项 | 模型表格已有 input/label 交互过滤，同构 Chrome 复现中选择和取消正常；待明确入口与模型名 |
| 8 | 关联成功只提示“成功” | 反馈语义不明确，且子弹窗更新草稿时没有专用关联提示 | 创建表单和模板创建配置了 common:Success，关联子弹窗未配置 successToast |
| 9 | 知识库模型停用导致关联应用无法打开 | 应用详情补齐知识库展示信息时误用严格模型 getter，异常使整个详情接口失败并触发前端跳转 | 已确认接口、共享调用链和停用检查；详见第 10 节 |

## 2. 新增前测试失败

### 调用链

1. `AddModel.tsx` 的 `BlankModelCreateModal` 用 `selectedChannelIds` 保存关联草稿。
2. 关联子弹窗确认只更新本地 Set，不写入 AI Proxy；新建渠道时也使用 `models: []`。
3. `useModelChannelTest.ts` 读取当前表单，通过 `postTestDraftModel` 请求 `POST /admin/settings/model/test`。
4. `pages/api/admin/settings/model/test.ts` 为草稿补充临时 modelId，清除请求级 URL/认证覆盖，并传入 `Aiproxy-Channel` 请求头。
5. AI Proxy v0.6.5 的 `GetChannelFromHeader` 在指定模型对应的已启用/已停用渠道映射中查找渠道 ID，并非直接按 ID 加载任意渠道。没有绑定时无法命中。
6. 点击保存后，`createSystemModel` 先执行 `appendModelsToAIProxyChannels`，再创建 MongoDB 模型。保存后同一组合才满足上述路由前提。

源代码位置：

- [草稿选择与测试接入](../../projects/app/src/pageComponents/model/AddModel.tsx)
- [测试 API](../../projects/app/src/pages/api/admin/settings/model/test.ts)
- [创建与批量创建服务](../../projects/app/src/service/core/ai/model/service.ts)
- [AI Proxy v0.6.5 渠道选择](https://github.com/labring/aiproxy/blob/v0.6.5/core/controller/relay-channel.go#L56)
- [AI Proxy v0.6.5 模型预检](https://github.com/labring/aiproxy/blob/v0.6.5/core/middleware/distributor.go#L450)

该结论适用于未绑定的草稿模型—渠道组合；如果上游渠道本来已经支持该模型，新建前也可能测试成功。编辑已有模型时，刚选中但尚未保存的新渠道同样受影响。项目开发部署文件锁定 v0.6.5；用户实际部署版本尚未读取。

### 修复方向与验证

测试应消费“当前模型草稿 + 指定渠道连接能力”，不能要求先保存绑定。应核实 AI Proxy 是否提供能保留当前模型参数、协议适配和模型映射的无绑定测试能力；如果没有，需要在代理层补充或设计明确的服务端适配。仅继续附加渠道 Header 不能解决问题，不能通过悄悄保存模型/绑定来绕开。

验证必须构造：MongoDB 中无此模型，目标渠道也不包含此模型标识。执行测试后检查上游收到实际请求，且前后模型库、渠道模型数组均不变。覆盖已有渠道、刚创建的空渠道，以及编辑中尚未保存的新增关联。预绑定的测试夹具不能证明此场景通过。

## 3. 空白重排模型参数校验失败

### 数据变化

`createBlankSystemModelData` 为重排返回 `config: {}`；表单挂载可选的 `config.maxToken` 输入。共享 `MyNumberInput` 使用 `register(..., { valueAsNumber: true })`，空输入进入表单后成为 NaN。

`ModelConfigForm` 提交时只清理顶层 null/undefined/NaN。嵌套的 `config.maxToken` 不会被清理；价格规范化也不处理它。

```text
空白 config: {}
  → 挂载输入框：config.maxToken = NaN
  → 顶层清理遗漏 config 内部
  → JSON 请求：config.maxToken = null
  → z.number().optional() 拒绝 null
```

真实 Chrome 诊断结果：

```json
{
  "empty": {
    "nestedNaN": true,
    "wireConfig": { "maxToken": null },
    "success": false,
    "errorPath": ["config", "maxToken"],
    "message": "Invalid input: expected number, received null"
  },
  "filled": {
    "wireConfig": { "maxToken": 16000 },
    "success": true
  }
}
```

位置：`ModelConfigForm.tsx` 的重排参数和提交处理、`packages/web/components/common/Input/NumberInput/index.tsx` 的数值注册、`packages/global/core/ai/model.schema.ts` 的 `RerankModelConfigSchema`。

修复应在表单值到模型草稿的边界明确处理可选数值：留空输出 undefined，有效输入保留数值，非法输入给字段错误。保存和测试复用同一规则。不要把所有嵌套 null 无差别删除，因为 LLM 的 `maxTemperature: null` 有明确业务含义；也不要为了通过校验把可选值强行默认成 0。

验证覆盖：初始留空、输入后清空、正常数值、低于最小值；分别执行新建、编辑保存和草稿测试。

## 4. 第 3、6 项的渠道复选框根因

`ModelChannelSelector` 同时用于模板创建第二步和独立关联弹窗。

```tsx
<Tr onClick={() => toggleChannel(channel.id)}>
  <Td>
    <Checkbox
      isChecked={selectedIds.has(channel.id)}
      onClick={(event) => event.stopPropagation()}
      onChange={() => toggleChannel(channel.id)}
    />
  </Td>
</Tr>
```

当前安装的 Chakra UI 为 2.10.7。`Checkbox` 的根节点是 label；`useCheckbox.getRootProps()` 先展开 htmlProps，随后重新赋值 onClick，所用回调来自 `getRootProps` 的参数，而这里调用时没有传参。结果是上面的 Checkbox onClick 未执行。

真实鼠标点击外观方框时，Chrome 产生以下调用：

```text
row:SPAN → row-toggle → row:INPUT → row-toggle → checkbox-onChange
```

第一次行点击更新选中状态，label 随后激活 input，又进入切换流程。复现结果：初始未选时点击两次仍未选；先点击渠道名称选中后，再点击方框仍保持选中。将阻止冒泡移到实际 DOM 外层 Td 后，轨迹只剩 `checkbox-onChange`，选中/取消恢复正常。

注意：同一最小复现通过 JSDOM 的 `.click()` 未呈现选中失败，真实 Chrome 的鼠标点击可以稳定复现。因此不能仅依赖合成 change 事件或简化 DOM 单测验收。

模板创建向后端提交 `selectedTemplates` 和 `selectedChannelIds`；服务端把全部待创建模型标识一次追加到每个选中渠道，未发现“多于一个模型则不关联”的分支。应先修复共享选择器，再用多模板实际提交并回读关系验证，不要直接重写后端批量关联算法。

推荐明确事件归属：方框的 onChange 负责选择，外层 DOM 隔离其 click；行点击只处理非交互区域。测试按钮、键盘 Space、全选和取消全选也应覆盖。

## 5. 模板创建新增渠道缺失

`TemplateCreateModal` 第二步只有 `ModelChannelSelector`。选择器没有创建回调，模板控制器没有创建弹窗状态和成功后的渠道 ID 回填；不能通过现有页面操作完成需求。

建议沿用空白创建的生命周期：

1. 在第二步提供“新增渠道”，由模板创建控制器持有弹窗与选择状态。
2. 新渠道立即独立创建，模型列表允许为空；未保存的模板模型在最终创建时批量关联。
3. 成功后使用创建响应中的精确渠道 ID 刷新列表并自动选中，同时保留此前渠道与模板选择。
4. 新渠道创建失败则保留输入、不插入伪记录。创建成功但刷新失败应支持恢复列表，不能把已完成写入提示成创建失败。
5. 用户取消模型创建时，新渠道保留；这与当前空白创建行为一致。该生命周期在实现时需要清楚体现。

`EditChannelModal.fixedModel` 当前只支持一个模型，不能简单把模板数组塞入单模型展示接口。多模板展示应支持模型集合或数量，并保持最终绑定全量提交。

## 6. 管理渠道跳转丢失编辑

### 空白创建

`BlankModelCreateModal.goToChannelManagement` 直接 `onClose()` 后 `router.push()`，没有订阅表单 dirty，也没有离开确认。参数和关联草稿会随弹窗卸载丢失。

### 编辑模型

`useModelEditWorkflow` 已比较 `isFormDirty` 与渠道集合差异；存在变化时调用 `openLeaveConfirm`。`ModelEditModal` 也已接入 `onDirtyChange` 和渲染 `LeaveConfirmModal`。不能把这部分描述为“完全没实现”。

发现的具体漏判条件：`DefaultConfigField`、`VoicesField` 只在 JSON.parse 成功后 setValue 并标记 shouldDirty。用户仅输入非法/未完成 JSON 时，原始文本发生变化但表单仍保存旧对象，可能保持 isDirty=false；跳转判断无法看到这部分编辑。是否正好对应本次反馈，需结合用户修改的字段确认。

用户已确认：空白/编辑共用离开保护，只要有任何未保存变更，前往渠道管理都必须提示，覆盖表单字段、渠道集合与原始 JSON 文本变化（包括未完成或格式非法的 JSON）。取消离开原样保留草稿；确认离开只导航，不提交；没有变更时直接跳转。普通输入字段与合法 JSON 的现有保护也需真实页面回归。

## 7. 模型批量选择尚未闭环

模型管理表格使用 `useTableMultipleSelect.getRowSelectionProps`，会通过 `closest()` 排除 input、label 等交互元素；Chakra 的方框和图标处于 label 内，因此不会像渠道表一样再次触发行切换。真实 Chrome 的同构控制组中，选中和取消都正常。

模板选择表则使用 `pointerEvents="none"` 的 Checkbox 外观与行切换，是另一种实现。当前未拿到用户具体指的是哪张表、哪些模型，也没有复现“部分模型选不上”，因此不把第 7 项标成已确认根因。

后续验证应在真实页面按指定模型定位，检查点击实际命中的 DOM、modelId/模板 key、虚拟列表滚动前后是否错位，以及过滤切换后的选中状态。不要未经证据统一归咎于 Chakra 或模型 ID。

## 8. 成功提示语义

当前空白创建表单与模板创建均使用 `common:Success`。关联子弹窗的确认请求没有 successToast；空白/编辑父组件的 onConfirm 只回填选择并关闭子弹窗。

应为关联动作提供专用国际化文案“关联成功”，覆盖简体中文、繁体中文、英文等项目现有语言。子弹窗确认时关联列表立即更新；关联最终随模型保存生效的规则应保持清楚。创建渠道继续提示“创建成功”，创建模型继续表达模型创建结果，不宜直接替换全局 `common:Success`。

## 9. 本次验证与边界

- 使用仓库实际 React 18.3.1、Chakra UI 2.10.7、react-hook-form 7.43.1 和业务 Schema，在独立 headless Chrome 页面复现数值问题与渠道事件问题；页面不连接 FastGPT 服务。
- 复选框对照：渠道原实现失败；现有模型表格的交互过滤模式正常；外层 Td 阻止冒泡正常。这里只证明事件模式，不代表完成整个管理页验收。
- 诊断脚本与结果位于 `/tmp/fastgpt-model-bug-analysis-20260909/`，包括 `browser-results.json`、`numeric-results.json`。
- 已有局部测试 3 个文件、40 项全部通过：`submit.test.ts` 14 项、模型测试 API 的 `test.test.ts` 11 项、AI Proxy 渠道 `channel.test.ts` 15 项。
- 上述 API 测试替换了实际模型调用，不能验证未绑定草稿经过真实 AI Proxy 的结果；表单提交单测也不能替代空数值控件挂载后的检查。
- 未运行全量测试，未重新执行历史验收文档中的服务端/浏览器场景，未把历史通过记录当作本次验证证据。

第 7 项按用户要求暂不处理。第 5 项已按所有未保存变更统一保护。第 3 项已在浏览器中选择两个模版并进入渠道配置步骤，后端真实关系回读仍需在具备可用外部渠道的环境执行。

## 10. 补充问题 9：知识库模型停用导致应用打不开

### 触发接口与完整链路

主要入口是 `GET /api/core/app/detail?appId=...`，并非知识库搜索接口。

```text
应用详情页 AppContext.reloadApp
  → getAppDetailById
  → GET /api/core/app/detail
  → authApp（应用读取权限）
  → rewriteAppWorkflowToDetail
  → formatSelectedDatasetValue / loadDatasetInfo
  → getEmbeddingModelData(getDatasetModelReference(dataset, 'embedding'))
  → assertModelAvailable 检测 isActive=false 并抛错
  → Promise.all 拒绝，整个应用详情接口失败
  → AppContext.onError 跳转 /dashboard/agent
```

关键位置：

- `projects/app/src/pages/api/core/app/detail.ts:40`：读取详情后调用共享工作流详情转换。
- `packages/service/core/app/utils.ts:191`：为知识库展示信息读取向量模型，使用了执行期严格 getter。
- `packages/service/core/ai/config/handle.ts:77`：typedGetter 调用 assertModelAvailable。
- `packages/service/core/ai/utils.ts:402`：模型停用时抛出 `Model is disabled`。
- `projects/app/src/pageComponents/app/detail/context.tsx:130`：详情获取失败后跳回应用列表。

共享函数还被 `GET /api/core/app/version/latest` 和 `GET /api/core/app/version/detail` 使用，因此最新版本和历史版本详情同样受影响。`datasetSelectList` 与 `datasetParams.datasets` 两种知识库配置都会经过该分支，影响工作流及 ChatAgent 等关联知识库的编辑入口。

### 业务边界与修复方向

打开应用是配置读取行为，应检查应用及知识库的访问范围、存在性、删除/异常状态，不应要求知识库向量模型能够执行。模型停用不代表知识库被删除或无权限。

用户进一步确认：详情读取尽量返回能够获取的知识库数据。节点依赖的知识库读取失败、无权限、不存在或其他局部异常，应写入对应节点的 `error`，不得让单个知识库失败拒绝整个详情请求；其他知识库和其他节点继续读取。节点 Schema 已有 `error: string` 可选字段，应复用。多个失败应汇总保留原因，不能互相覆盖；异常引用应保留可修复线索，不得因读取时过滤而在后续保存中静默删除原关联，也不得返回无权访问的资源详情。

这里的降级边界是节点依赖加载：应用本身的身份认证、访问权限和存在性仍按接口原有规则处理。知识库模型停用本身不作为读取失败或节点错误；只有实际依赖读取异常进入对应节点 error。

修复位置应收敛在 `rewriteAppWorkflowToDetail` 的知识库详情补齐，而非在前端忽略整个接口错误，或放宽全局 `assertModelAvailable`：

1. 用户最终确认：知识库详情补齐只返回知识库绑定的模型 ID，不读取完整模型配置，不调用 getEmbeddingModelData、findModelData 或其他模型可用性查询，也不判断模型是否停用。此前建议改用展示 getter 的方案已被此规则替代。
2. 模型已删除或引用无效时，仍原样返回知识库保存的绑定 ID，不在本接口解析或验证该 ID。历史仅有模型名称的数据按既有兼容规则保留引用，不伪造 ID，也不为本次详情读取增加模型查询。
3. 当前缺失/已删除知识库的占位分支还会调用 `getDefaultModelData('embedding')`。如果没有可用默认模型，此分支也会让详情失败；必须一起去掉这种展示对默认模型的依赖，不能替换成另一个默认模型来掩盖原引用。
4. `SelectedDatasetSchema` 当前要求 `vectorModel: { model: string }`。实现时需同步调整为绑定模型引用的传输契约，并检查前端消费方；不能只移除 getter，却继续要求接口返回完整模型对象或旧结构。
5. 实际执行向量检索或训练时仍需要检查模型可用性，并在该操作入口给出错误；本需求只移除配置读取阶段的错误阻断。

权限现状要准确区分：此详情补齐分支目前用 teamId 限定查询范围并判断 deleteTime，没有调用知识库细粒度 `authDatasetByTmbId`。因此不能声称已有完整知识库 ACL 校验；实现时需按应用引用知识库的既有授权规则核对访问身份和异常展示，避免用“取消模型校验”同时放宽资源边界。

### 验证要求

- 存在、有权限的知识库，向量模型停用：应用详情、最新版本、历史版本均可读取，知识库保留正常状态。
- 向量模型删除/引用失效，且没有默认 embedding 模型：应用仍能打开，允许用户调整关联。
- 知识库软删除、物理删除、跨团队或无权访问：维持对应的资源异常/权限行为，不因取消模型校验被视为正常资源。
- 一个节点关联多个知识库，其中部分失败：返回其余可读取数据，失败写入该节点 error；其他节点正常返回，整个详情读取成功。
- 多个节点各自失败：错误归属正确、原因不互相覆盖；依赖恢复后重读不残留旧的加载错误。
- 同时覆盖 datasetSelectList、datasetParams.datasets，以及历史单对象知识库选择格式。
- 真正发起向量检索时，停用模型仍被执行入口拒绝。

现有 `projects/app/test/service/core/app/rewriteAppWorkflowToDetail.test.ts` 覆盖正常知识库及删除占位，但展示用例采用可用模型或已有 vectorModel 快照，没有覆盖上述停用与缺少默认模型条件；本轮未操作线上数据。

### 补充核对：选择知识库弹窗的当前行为

选择弹窗的列表接口 `/api/core/dataset/list` 使用 findModelData 查询绑定的 embedding 模型元数据，允许停用模型；停用不会让列表接口报错，模型已删除则 vectorModel 返回 undefined。

但 `projects/app/src/components/core/app/DatasetSelectModal.tsx` 明确要求 `item.vectorModel?.isActive === true` 才能选择。停用/删除模型的知识库仍在列表中，方框禁用，点击未选中的行会提示“索引模型已下架”，且不参与全选；模型名称也会被“索引模型已下架”替代。已有选中项不会仅因模型停用自动过滤，仍可从右侧移除。

这与应用详情的严格 getter 报错是两处独立限制。按用户“不判断模型停用”的规则，实现时需要同时移除弹窗的启用状态门槛；模型名称展示与知识库可选性分开处理。若保留名称展示，可通过绑定 ID 查询非阻断的展示元数据，缺失时显示 ID 或缺失占位，不能再次变成选择条件；应用详情本身仍只返回绑定 ID。当前多知识库兼容性比较用 vectorModel.model，切换引用契约时也需改为绑定 ID 比较，保留已有的同索引模型约束。
