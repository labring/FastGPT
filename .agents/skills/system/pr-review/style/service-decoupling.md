# Service 解耦规范

## 核心原则

**后端 service 之间不允许互相引用，只允许单向依赖，跨 service 的协调由上层 controller 完成。**

如果 serviceA 确实需要 serviceB 的数据，**由 controller 提前调用 serviceB，将结果以参数形式传入 serviceA**，而不是让 serviceA 自行 import serviceB。

---

## 依赖方向

```
Controller / API Handler
    ↓ 调用 serviceB → 得到结果
    ↓ 将结果作为参数传入 serviceA
   Service A      Service B      Service C
       ↓ 调用         ↓ 调用         ↓ 调用
  Repository    Repository    Repository
  (DB Model)    (DB Model)    (DB Model)
```

**合法方向**：
- `controller` → `service`（上层调用下层，允许）
- `service` → 本模块的 DB Model（允许）
- `service` → `packages/service/common/`（公共工具，允许）
- `service` 接收其他 service 的**数据结果**（以参数形式传入，允许）

**违规方向**：
- `serviceA` import `serviceB`（同级 service 互相引用，禁止）
- `serviceA` → `controllerB`（service 引用上层，禁止）

---

## 违规模式识别

### 1. 同级 service 直接 import

```typescript
// ❌ 违规：datasetService 直接引用 workflowService
// packages/service/core/dataset/service.ts
import { dispatchWorkflow } from '../workflow/service';

export async function deleteDataset(datasetId: string) {
  await MongoDataset.deleteOne({ _id: datasetId });
  await dispatchWorkflow({ datasetId });  // 违规：跨 service 调用
}
```

**识别方式**：在 `packages/service/core/xxx/` 目录下的文件中，import 了同级其他模块的 service 文件。

---

### 2. 循环依赖

```typescript
// ❌ serviceA 引用 serviceB，serviceB 也引用 serviceA → 循环依赖
// dataset/service.ts
import { updateAppDataset } from '../app/service';

// app/service.ts
import { getDatasetInfo } from '../dataset/service';
```

循环依赖会导致模块加载时出现 `undefined` 错误，且极难排查。

---

### 3. 在 service 内触发副作用业务

```typescript
// ❌ service 内部触发了属于其他业务域的逻辑
export async function updateDatasetCollection(collectionId: string, data: UpdateData) {
  await MongoDatasetCollection.updateOne({ _id: collectionId }, { $set: data });

  // 违规：更新数据集集合后，直接触发通知或工作流——这是其他业务域的职责
  await sendTeamNotification(teamId, 'collection_updated');
  await triggerRebuildIndex(collectionId);
}
```

---

## 正确模式：由 Controller 协调

### 模式1：Controller 顺序调用多个 service

```typescript
// ✅ controller 层负责协调多个 service
// projects/app/src/pages/api/core/dataset/collection/update.ts

import { updateDatasetCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { sendTeamNotification } from '@fastgpt/service/support/user/team/controller';
import { triggerRebuildIndex } from '@fastgpt/service/core/dataset/training/controller';

export default async function handler(req, res) {
  const { collectionId, ...data } = req.body;

  // 1. 更新集合（dataset service 只做自己的事）
  await updateDatasetCollection(collectionId, data);

  // 2. 发送通知（由 controller 层调用通知 service）
  await sendTeamNotification(teamId, 'collection_updated');

  // 3. 触发重建索引（由 controller 层调用训练 service）
  await triggerRebuildIndex(collectionId);

  res.json({ success: true });
}
```

### 模式2：serviceA 需要 serviceB 的数据 → Controller 提前获取并以参数传入

当 serviceA 的某个函数需要用到 serviceB 的查询结果时，**不要让 serviceA 内部去调用 serviceB**，而是由 controller 先查询，再将结果作为参数传给 serviceA。

```typescript
// ❌ 违规：serviceA 内部自己去查 serviceB 的数据
// packages/service/core/dataset/service.ts
import { getTeamInfo } from '../support/user/team/service';  // 跨 service import

export async function checkDatasetQuota(datasetId: string) {
  const dataset = await MongoDataset.findById(datasetId);
  const team = await getTeamInfo(dataset.teamId);  // 违规：直接调用其他 service
  return dataset.usedSize < team.maxDatasetSize;
}

// ✅ 正确：controller 提前获取 team 信息，以参数形式传入
// packages/service/core/dataset/service.ts
export async function checkDatasetQuota(
  datasetId: string,
  teamMaxSize: number   // ← 由 controller 传入，service 不关心数据从哪来
) {
  const dataset = await MongoDataset.findById(datasetId);
  return dataset.usedSize < teamMaxSize;
}

// projects/app/src/pages/api/core/dataset/xxx.ts（controller 层）
import { getTeamInfo } from '@fastgpt/service/support/user/team/controller';
import { checkDatasetQuota } from '@fastgpt/service/core/dataset/service';

export default async function handler(req, res) {
  const { datasetId, teamId } = req.body;

  // controller 负责获取跨域数据
  const team = await getTeamInfo(teamId);

  // 将所需数据作为参数传入 service
  const hasQuota = await checkDatasetQuota(datasetId, team.maxDatasetSize);

  // ...
}
```

**这个模式的好处**：
- `checkDatasetQuota` 可以独立测试，只需传入 `datasetId` 和 `teamMaxSize`，无需 mock 整个 team service
- service 的职责更纯粹：只处理本模块的数据，不感知其他模块的存在
```

---

## 公共逻辑的处理

如果多个 service 都需要某个逻辑，不应让它们互相引用，而应将公共逻辑**下沉到 common 层**。

```
packages/service/
├── common/           ← 公共工具层，可被所有 service 引用
│   ├── error/
│   ├── file/
│   └── string/
├── core/
│   ├── dataset/
│   │   └── service.ts   ← 只引用 common/，不引用 core/workflow/
│   └── workflow/
│       └── service.ts   ← 只引用 common/，不引用 core/dataset/
```

```typescript
// ✅ 公共逻辑下沉到 common 层
// packages/service/common/permission/utils.ts
export function checkTeamPermission(teamId: string, userId: string) { ... }

// dataset/service.ts 和 workflow/service.ts 都可以引用 common
import { checkTeamPermission } from '../../common/permission/utils';
```

---

## 审查检查清单

审查新增或修改的 service 文件时，重点检查：

- [ ] 文件顶部的 `import` 列表中，是否有引用同级或跨域的 service 文件？
- [ ] 是否出现了 `import xxx from '../otherModule/service'` 或 `from '../otherModule/controller'`？
- [ ] 若有跨模块调用，是否可以通过**上移到 controller 层**来解决？
- [ ] 公共逻辑是否应该下沉到 `common/` 而不是通过互相引用实现？

**快速 grep 方法**：

```bash
# 找出 service 文件中可能的跨 service 引用
grep -rn "from '\.\./[^/]*/service" packages/service/core/
grep -rn "from '\.\./[^/]*/controller" packages/service/core/
```

---

## 为什么这样设计

**可测试性**：service 不依赖其他 service，可以独立 mock 测试，无需构造复杂的依赖图。

**可维护性**：修改一个 service 不会意外影响另一个 service，降低改动的波及范围。

**可读性**：阅读 controller 代码时，业务流程一目了然——"先做 A，再做 B，再做 C"，而不是藏在 service 内部的隐式调用链。

**避免循环依赖**：互相引用极易形成循环依赖，导致运行时 `undefined` 错误，且 TypeScript 编译不会报错，只会在运行时暴露。
