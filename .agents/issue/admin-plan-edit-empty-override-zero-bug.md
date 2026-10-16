# 管理员后台套餐编辑中自定义覆盖上限留空被错误置为 0 的问题分析

## 1. 现象与触发场景

在管理员后台套餐管理页面（`/admin/plans`）编辑标准套餐时：
表单下方提示：“下面的值会覆盖套餐配置，不填则会用套餐的标准值”。
然而当管理员未填写（或清空）“知识库索引容量上限”（`maxDatasetSize`）等可选配额限制项并保存后，这些字段在数据库中被更新为 `0`，而非 `null` 或不覆盖。
导致目标团队对应的配额被重置为 0（如知识库容量上限变成 0 条索引），套餐标准值未能生效。

## 2. 根本原因（First-Principles 链路分析）

链路包含前端表单状态传输与后端 Schema 解析两层缺陷：

### 2.1 后端 Zod Schema 强制类型转换缺陷
- `packages/global/openapi/admin/wallet/plan/api.ts` 中的 `UpdatePlanBodySchema` 定义为：
  ```ts
  maxDatasetSize: NumSchema.optional().meta({ description: '最大知识库容量' })
  ```
- `NumSchema` 的定义为 `z.coerce.number<number>()`（底层使用 JavaScript 原生 `Number(val)`）。
- 在 JavaScript 类型转换中：
  - `Number('') === 0`
  - `Number(null) === 0`
- 因此，无论是前端提交的空字符串 `""`，还是历史数据中的 `null`，在经过 `NumSchema.optional().parse(val)` 处理时，全部被隐式强制转换成了数字 `0`。
- 后端业务处理逻辑（`pro/admin/src/pages/api/admin/wallet/plan/updatePlan.ts`）使用了空值合并：
  ```ts
  maxDatasetSize: body.maxDatasetSize ?? null
  ```
  由于 `body.maxDatasetSize` 已被 Zod 转成 `0`，`0 ?? null` 的结果依然是 `0`，直接持久化写入 MongoDB，覆盖了标准值。

### 2.2 前端表单处理缺陷
- `projects/app/src/pageComponents/admin/plans/components/PlanEditModal.tsx` 中：
  - 使用 `react-hook-form` 绑定 `<Input type="number" {...register('maxDatasetSize')} />`。
  - 用户清空输入框或留空时，原生 input 产生的表单值为 `""`（空字符串）。
  - 点击“编辑”从 `data` 初始化时，若原值为 `null`，表单被直接赋值为 `null`。
  - 提交时未对可选数值项做空值规范化，直接将 `""` 或 `null` 通过 POST 发送给后端，触发后端的 `z.coerce.number()` 转换为 `0`。
  - 此外表单项存在 `id="totalPoints"` 的拷贝粘贴错误，导致无障碍标签关联错乱。

## 3. 解决方案设计

1. **底层 Schema 抽象增强（`@fastgpt/global/common/zod`）**：
   - 新增 `optionalEmptyToUndefined` helper：将 `null` 与 `""`（空字符串）在解析前统一预处理为 `undefined`，同时严格保留合法数值 `0` 与 `"0"`。
   - 在 `packages/global/openapi/admin/wallet/plan/api.ts` 中，将标准套餐的所有可选覆盖配额字段（`maxDatasetSize`、`maxTeamMember`、`maxApp`、`maxDataset` 等）改为使用 `optionalEmptyToUndefined(NumSchema)`。

2. **前端交互与数据归一化（`PlanEditModal.tsx`）**：
   - 在表单打开初始化（`reset`）时，将 `null` 转为 `undefined`，保证输入框为标准未受控空状态。
   - 在表单提交（`onSubmit`）前，统一通过 `formatOptionalNumber` 将 `""`、`null`、`undefined`、`NaN` 规范化为 `undefined`；若用户明确输入了 `0` 则保留 `0`。
   - 修复 `htmlFor` 与 `id` 属性的复制粘贴错误，并增加 `placeholder="跟随套餐"` 明确未填时的继承行为。

3. **测试覆盖**：
   - 增加 `optionalEmptyToUndefined` 的单元测试。
   - 在 `packages/global/test/openapi/admin/wallet/plan.test.ts` 中增加留空、null、0、正数值的多重测试用例，确保回归防护。

