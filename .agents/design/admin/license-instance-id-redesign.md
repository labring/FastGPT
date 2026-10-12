# License 重构设计 — LicenseDataType 重构 + 实例 ID 绑定

> 状态：**部分确认（§6 实例 ID 方案已定；§8 其余项待评审）**
> 背景：pro/admin 独立管理后台下线，管理员能力并入前台 app；LicenseDataType 结构重构
> 范围：License 类型结构、签发格式、验证逻辑、绑定标记、前端激活流程
> 关联代码：`packages/global/common/system/types/index.ts`（类型）、`pro/admin/src/service/common/license/auth.ts`（验证）、`pro/admin/src/components/common/License/Input.tsx`（激活 UI）、`projects/app/src/web/common/license/api.ts`（app 激活入口）

---

## 1. 背景与问题

### 1.1 管理员迁移

原商业版部署形态：pro/admin 作为**独立管理后台**，有独立域名，License 通过 `hosts` 字段绑定"管理端有效域名"，前端在 `Header.tsx` 校验 `location.host` 是否在 `hosts` 中，不在则清空 license 并跳登录。

管理员主页迁移到 app 后：

1. **没有独立管理域名**：app 可能被多域名、多 IP、反向代理访问，`location.host` 无法唯一标识一个部署实例。
2. **前端校验天然可绕过**：现有 hosts 校验只在浏览器 JS 里做，后端 `authLicense()` 从不校验 hosts。换标记的同时应把校验放到后端，强度反而提升。

需要一个**与部署形态无关、后端可验证**的部署唯一标记。

### 1.2 类型重构

现有 `LicenseDataType` 的问题：

1. **限制字段散落顶层**：`maxUsers`/`maxApps`/`maxDatasets` 平铺，与身份字段混在一起，不直观。
2. **功能开关扁平**：`functions` 里功能与自定义模板市场等营销性开关混放，无版本概念，市场无法灵活扩展。
3. **无版本区分**：试用版/正式版只能靠 `expiredTime` 隐含表达，无法在数据层面区分。
4. **默认值语义不便扩展**：现有验证逻辑缺失功能字段时补 `false`（默认关），市场新增功能必须改签发侧并重签所有 license 才能启用。

目标：功能与限制对象化、增加版本字段、功能开关默认 `true`（激活后全开，市场扩展零成本）。

## 2. 现状分析

### 2.1 License 结构（签发侧，官方私钥生成）

```
license = signature(684 字符 base64) + payload(base64 JSON)
```

- payload = `LicenseDataType`
- 签名 = RSA-4096 私钥对 **base64 payload 字符串字节**做 RSA-SHA256
- 公钥硬编码在 `pro/admin/src/service/common/license/auth.ts` 的 `LICENSE_PUBLIC_KEY`

### 2.2 LicenseDataType 字段全景（现行）

| 类别 | 字段 | 说明 | 消费位置 |
|---|---|---|---|
| 身份 | `company` | 客户公司名 | 前端展示、`/license/auth` 未登录返回 |
| 时间 | `startTime` / `expiredTime` | 生效/过期时间 | `expiredTime` 后端校验过期；其余展示 |
| 备注 | `description?` | 描述 | **无消费点**（死字段） |
| 绑定 | `hosts?` | 管理端有效域名 | 仅 pro/admin 前端 `Header.tsx` 校验，后端不校验 |
| 配额 | `maxUsers?` | 最大用户数，不填不限 | `auth.ts` `licenseAuth.authMaxUsers`：`users > maxUsers` 拒绝 |
| 配额 | `maxApps?` | 最大应用数，不填不限 | `teamLimit.ts`：`apps > maxApps` 拒绝（`>` 等额允许） |
| 配额 | `maxDatasets?` | 最大数据集数，不填不限 | `teamLimit.ts`：`datasets >= maxDatasets` 拒绝（`>=` 等额拒绝） |
| 功能 | `functions.sso` | 企业登录 | pro 配置页登录方式选项 |
| 功能 | `functions.pay` | 计费/套餐 | pro `Navbar.tsx`、app `AdminContainer.tsx` 导航 |
| 功能 | `functions.customTemplates` | 自定义模板市场 | pro `Navbar.tsx`、app `AdminContainer.tsx` 导航 |
| 功能 | `functions.datasetEnhance` | 数据集增强 | 定时任务开关（autoTraining/imageIndex/imageParse）+ 前端 `show_dataset_enhance` |
| 功能 | `functions.batchEval` | 批量评估 | 前端 `show_batch_eval` |

### 2.3 验证流程（`authLicense`）

1. 取 license 字符串（入参优先，否则从 `MongoSystemConfigs` type=license 读已存）
2. `signature = license.substring(0, 684)`，`payload = license.substring(684)`
3. `crypto.createVerify('RSA-SHA256').update(payload).verify(PUBLIC_KEY, signature, 'base64')` 验签
4. `JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))` 解析
5. `expiredTime < now` → "License 已过期"
6. 缺 `functions` → "License 内容错误"
7. 缺失 function 字段与 `licenseDefaultData` 合并补 `false`（**待改为默认 true**）
8. 成功写入 `global.licenseData`；失败置 `undefined`

### 2.4 激活与加载链路

| 时机 | 逻辑 | 位置 |
|---|---|---|
| 激活 | `POST /admin/common/license/active`：验签 → upsert `MongoSystemConfigs`（type=license，value=`{license, data}`）→ 写 `global.licenseData` | `pro/admin/src/pages/api/admin/common/license/active.ts` |
| 启动 | 从 DB 读已存 license 重验 | `instrumentation-node.ts` |
| 定时 | 每小时 `15 */1 * * *` 重验（刷新过期） | `service/system/cron.ts` |
| watch | 配置变更时重验 | `middleware/volumnMongoWatch.ts` |
| 读取 | `GET /admin/common/license/auth`：未激活空；管理员全量；未登录仅 `company` | `pages/api/admin/common/license/auth.ts` |

### 2.5 拦截层

- `licenseCheck` middleware：仅检查 `global.licenseData` 存在，不校验 hosts。
- 配额/功能开关：消费方直接读 `global.licenseData`（`teamLimit.ts`、`licenseAuth.authMaxUsers`、定时任务、前端导航）。

### 2.6 迁移现状（app 侧已就位）

- app 已有 `components/admin/License/{Input,LicenseData}.tsx`、`web/common/license/api.ts`（走 `/proApi` 代理到 pro/admin）
- `useSystemStore` 已支持 `licenseData/initLicenseData/clearLicenseData`
- 未接入：app Layout 的"未激活弹 LicenseInput"逻辑；`AdminContainer.tsx` 的 `adminLicenseFunctions` 仍为硬编码 `{pay:false, customTemplates:false}` 占位

## 3. 问题定义

1. 绑定标记从 `hosts`（域名）换成什么，才能在"无独立管理域名、多域名访问、后端可验证"的形态下唯一标识部署实例？
2. LicenseDataType 如何对象化（功能/限制分组）、版本化（试用/正式）、功能开关可扩展（默认 true）？
3. 如何兼容存量 license（老客户已签发、旧结构）？
4. 离线/内网客户必须继续可用（不能强制联网）。

## 4. 绑定方案选型

| 方案 | 绑定对象 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 部署实例 ID | 首次启动生成的随机 ID（持久化） | 离线可用、任意部署形态、后端校验、改动最小 | ID 可被清除 → 需官方解绑流程 | **推荐** |
| B. 机器指纹 | MAC/CPU/磁盘哈希 | 绑定强、无需上报 | Docker/K8s/云主机指纹不稳定，重建即变 | 不推荐 |
| C. 在线激活 | 官方 license server | 可吊销、可订阅化 | 破坏离线/内网客户，架构大改 | 暂缓（可预留） |
| D. 保留域名绑 app 域名 | app 域名 | 改动最小 | 多域名/IP 失效，与前提矛盾 | 排除 |

**选 A**：RSA 验签体系不变，仅把绑定标记从 `hosts` 换成 `instanceId`，校验从"前端域名检查"升级为"后端实例校验"。商业信任模型下足够。

## 5. LicenseDataType 重构

### 5.1 新类型定义（`packages/global/common/system/types/index.ts`）

```ts
export type LicenseVersionType = 'trial' | 'official';   // 试用版 / 正式版

export type LicenseDataType = {
  // —— 版本 ——
  version?: LicenseVersionType;      // 缺省按 official 处理（存量兼容）

  // —— 身份与时间 ——
  startTime: string;
  expiredTime: string;
  company: string;
  description?: string;

  // —— 绑定（实例 ID 方案）——
  instanceId?: string;               // 新：绑定部署实例（替代 hosts）
  hosts?: string[];                  // 存量兼容，新签发不再使用

  // —— 限制（对象）——
  limits: {
    maxUsers?: number;               // 最大用户数，不填默认不上限
    maxApps?: number;                // 最大应用数，不填默认不上限
    maxDatasets?: number;            // 最大数据集数，不填默认不上限
    // 预留：后续配额（如 maxDatasetSize、requestsPerMinute）在此扩展
  };

  // —— 功能（对象，默认 true）——
  functions: {
    sso: boolean;                    // 企业登录（保持）
    pay: boolean;                    // 计费/套餐（保持）
    eval: boolean;                   // 评估（保持，原 batchEval，命名待确认）
    datasetEnhance?: boolean;        // 数据集增强（去留待确认）
    // customTemplates 已移除（自定义模板市场）
    assistantGenerate: boolean;      // 辅助生成（新增，命名待确认）
    portal: boolean;                 // 门户（新增，命名待确认）
    sandboxSkills: boolean;          // 沙盒与技能（新增，命名待确认）
  };
};
```

### 5.2 语义变化：功能默认 true

| 项 | 现行 | 新 |
|---|---|---|
| 缺失功能字段 | 补 `false`（默认关） | 补 `true`（默认开） |
| 未激活（无 license） | `global.licenseData = undefined` → 全关 | 不变（undefined → 全关） |
| 新功能上线 | 需改签发侧 + 重签所有 license | 零成本，老 license 自动获得 |

**商业语义**：购买 license = 默认全功能开启，个别客户特批降级时显式写 `false`。签发侧必须注意：`sso`/`pay` 等收费功能**不写即开启**，需在签发工具中显式声明关闭项。

> ⚠️ 待确认：默认 true 是否覆盖全部功能（含 sso/pay），还是仅新增功能？见 §8。

### 5.3 存量 license 兼容与归一化

验证逻辑在 `authLicense` 验签后、写 `global.licenseData` 前，做一次归一化 `normalizeLicenseData(raw)`：

```ts
const normalizeLicenseData = (raw: any): LicenseDataType => ({
  version: raw.version ?? 'official',
  startTime: raw.startTime,
  expiredTime: raw.expiredTime,
  company: raw.company,
  description: raw.description,
  instanceId: raw.instanceId,
  hosts: raw.hosts,                        // 存量读取，不再校验
  limits: raw.limits ?? {
    maxUsers: raw.maxUsers,                // 旧结构顶层字段映射
    maxApps: raw.maxApps,
    maxDatasets: raw.maxDatasets
  },
  functions: {
    sso: raw.functions?.sso ?? true,       // 默认 true
    pay: raw.functions?.pay ?? true,
    eval: raw.functions?.batchEval ?? true, // 旧字段名映射
    datasetEnhance: raw.functions?.datasetEnhance ?? true,
    assistantGenerate: raw.functions?.assistantGenerate ?? true,
    portal: raw.functions?.portal ?? true,
    sandboxSkills: raw.functions?.sandboxSkills ?? true
  }
});
```

- 旧结构（顶层 `maxUsers` + `functions.{sso,pay,customTemplates,datasetEnhance,batchEval}`）自动映射
- `customTemplates` 读取后忽略（功能已移除）
- 存量 license 的 functions 均显式写过值，默认 true 不影响其取值

### 5.4 消费点改动清单

| 文件 | 现行 | 改为 |
|---|---|---|
| `teamLimit.ts` | `licenseData.maxApps` / `maxDatasets` | `licenseData.limits.maxApps` / `maxDatasets` |
| `auth.ts` `authMaxUsers` | `licenseData.maxUsers` | `licenseData.limits.maxUsers` |
| `auth.ts` `authDatasetEnhance` | `functions.datasetEnhance` | 取决于 datasetEnhance 去留 |
| `auth.ts` 默认值合并 | 补 `false` | 补 `true` + 归一化 |
| `system/index.ts` | `functions.datasetEnhance` / `batchEval` | `functions.datasetEnhance` / `eval` |
| `LicenseData.tsx`（pro + app） | 顶层 maxUsers 等 + 5 功能 | `limits.*` + 新 functions 展示（含 version 标签） |
| `AdminContainer.tsx` | 硬编码 `{pay, customTemplates}` | 读 `licenseData.functions`（pay + 新功能，移除 customTemplates） |
| `pro Navbar.tsx` | `functions.pay` / `customTemplates` | 移除 customTemplates 项 |
| 签发工具（仓库外） | 旧结构 | 新结构 + 默认 true 语义 |

## 6. 实例 ID 绑定方案

### 6.1 总体思路

```
签发侧（官方，持私钥）：
  payload 增加 instanceId = 客户部署实例 ID
  license = RSA4096 签名(payload) + payload          // 格式不变

验证侧（app 内，持公钥）：
  1. 验签 / 过期检查（不变）
  2. 归一化（§5.3）
  3. 新：license.instanceId && license.instanceId !== 本地实例 ID → 拒绝
  4. 兼容：license 无 instanceId（存量）→ 用 DB 中已记录的 boundInstanceId 校验
  5. 通过后写 global.licenseData
```

### 6.2 systemConfigs 集合写入机制（现状澄清）

`MongoSystemConfigs` 按 `type` 存 6 类配置，索引 `{ type: 1 }` **非唯一**，DB 层无"每 type 单条"约束。写入分两种模式：

| type | 写入方式 | 文档数 |
|---|---|---|
| `fastgpt` / `fastgptPro` | **append 历史式**：`config.ts:35-44` 每次保存 `create()` 插新文档；读取 `findOne().sort({ _id: -1 })` 取最新；`updateConfig.ts:53-59` 顺带删除 `createTime ≤ 1 个月前` 的旧文档 | 近一月保存次数 N 条（**正常设计**，非备份） |
| `license` / `systemMsgModal` / `operationalAd` / `activityAd` | **upsert 单文档**：`updateOne({ type }, { $set }, { upsert: true })` | 恒 1 条 |

- `license` 激活（`active.ts:25-33`）：**整体覆盖** `value: { license, data }`；`value.data` 是签名 payload，验签后只读
- change stream（`volumnMongoWatch.ts:30-33`）：`update` 无条件触发全量配置重载；`insert` 仅 `fastgptPro`/`license` 两个 type 触发 → **新增 type 的 insert 不触发重载**
- 集合多条 = fastgpt/fastgptPro 的近一月历史（正常）；`license` 出现多条才是异常（并发激活竞态或历史遗留）

### 6.3 实例 ID 存储方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| X. 独立 type | 新增枚举 `instanceId`；`findOneAndUpdate({ type }, { $setOnInsert }, { upsert: true })` 原子生成一次，之后只读 | 集群一致、原子防竞态、insert 不触发 watch 重载、身份与授权生命周期解耦、恒 1 条 | 需改 schema 枚举（对外契约小改） | **推荐** |
| Y. 写进 license 文档 | `value` 顶层加 `instanceId` | 不加枚举 | `active.ts` 激活整体 `$set` 覆盖 value → 续签/重签/删 license 都会冲掉身份；必须改 active.ts 防覆盖，身份与授权状态耦合 | 不推荐 |
| Z. 文件 | 持久卷 `data/instanceId` | 不依赖 DB | 多实例各自文件系统 → N 个容器 N 个 ID；只迁 Mongo 不带文件 → ID 丢失 | 不推荐 |

### 6.4 实例 ID 生成（推荐：独立 type + `$setOnInsert` + 纯 DB）

```
instanceId = crypto.randomBytes(16).toString('hex')   // 32 位 hex
```

- 存储：`MongoSystemConfigs` 新增枚举 `SystemConfigsTypeEnum.instanceId`，`value: { instanceId }`
- 生成（首次启动，幂等防竞态，全集群只生成一次）：

```ts
// 固定 _id（24 位 hex 合法 ObjectId）：主键唯一约束保证并发下只生成一次。
// 不能用 type 做并发去重 —— systemConfigs 的 type 索引非唯一（fastgpt/fastgptPro 需同 type 多文档历史）。
const INSTANCE_ID_DOC_ID = '000000000000000000000001';

await MongoSystemConfigs.findOneAndUpdate(
  { _id: INSTANCE_ID_DOC_ID },
  {
    $setOnInsert: {
      _id: INSTANCE_ID_DOC_ID,
      type: SystemConfigsTypeEnum.instanceId,
      value: { instanceId },
      createTime: new Date()
    }
  },
  { upsert: true, new: true }
);
```

- 之后**永不 update**：换 license / 重签 / 删 license 均不影响身份；change stream 收到 `insert`（非 fastgptPro/license）→ 不触发配置重载，零副作用
- 校验读取：`findOne({ _id: INSTANCE_ID_DOC_ID })`，与 license 验签并行
- **放弃文件双写**（多实例不一致 + 迁移丢失，见方案 Z）
- ⚠️ 并发正确性验证：`type` 索引非唯一，`findOneAndUpdate({ type })` 并发 upsert 会插入多条（测试实测 2 条）；改用固定 `_id` 后并发 8 路仅 1 条（`instanceId.test.ts` 覆盖）

> 防丢策略说明：实例 ID 清除 = 客户失去绑定凭据，需联系官方在签发侧解绑/重签。这是离线方案的固有代价，需在售卖/文档中明确。

### 6.5 验证逻辑（`authLicense` 增强）

顺序：验签 → 过期 → **实例校验** → 归一化 → functions 合并。

实例校验规则（后端读自己的 instanceId，**不信任前端传参**）：

```ts
const localInstanceId = await getInstanceId();
const boundInstanceId = licenseData.instanceId
  ?? (await getBoundInstanceId());        // 存量：独立 type licenseBind 中记录的绑定
if (boundInstanceId && boundInstanceId !== localInstanceId) {
  reject('License 与当前实例不匹配');
}
```

### 6.6 存量 license 迁移（老客户零干预）

1. 删除 `pro/admin Header.tsx` 的前端 hosts 校验（后端本就不校验，移除无损）
2. 存量 license（有 `hosts` 无 `instanceId`）首次验证通过后：自动绑定当前实例，绑定关系写入 **独立 type `licenseBind`**（`value: { boundInstanceId, boundAt }`，upsert）——**不动 license 文档、不改签名 payload**
3. 校验规则（存在即校验，堵传播）：
   - license 有 `instanceId` → 与本地实例 ID 比对
   - license 无 `instanceId` → 读 `licenseBind.boundInstanceId`：无 → 绑定当前实例并写库；有且不等于本机 → 拒绝
   - 两处都没有 → 放行（未绑定）
4. 解绑/换机：客户换服务器 → 官方在签发侧重签带 `instanceId` 的新 license；`licenseBind` 随旧 license 过期自然失效（记录保留作审计）

### 6.7 激活流程（app 内）

1. app Layout 未激活时弹 `LicenseInput`（接入现有组件）
2. 弹窗展示"当前实例 ID: xxx"（替代"当前域名为"），客户把实例 ID 发给官方
3. 官方签发绑定该实例 ID 的 license
4. 激活接口 `POST /proApi/admin/common/license/active` 验签后落库

### 6.8 消费方适配

- `licenseCheck`、配额校验、功能开关：**无需改动**（仍读 `global.licenseData`，仅字段路径变化见 §5.4）
- 实例校验失败时 `authLicense` 置 `global.licenseData = undefined`，自然拦截

## 7. 边界与风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 实例 ID 被清除 | license 失效，需官方解绑 | 文档明确 + 官方侧解绑流程；DB 单写降低概率（纯 DB 无文件丢失路径） |
| 存量 license 无 instanceId | 校验跳过或读 boundInstanceId | 自动绑定迁移（§6.6） |
| 同一 license 多实例共用 | 无法阻止（离线方案天然限制） | 接受；未来在线验证可解 |
| 功能默认 true | sso/pay 忘写 false 即免费开启 | 签发工具默认值模板显式列出全部开关 |
| 存量 license 归一化 | customTemplates 丢失（功能已移除） | 预期行为；旧客户不受影响（该功能已下线） |
| DB 迁移/容器重建 | instanceId 变化 | 纯 DB：dump/restore 必须携带 systemConfigs 集合；部署文档强调 |
| 存量 license 首次绑定前可传播 | 绑定发生在首次激活时 | 迁移窗口接受（现状本就无后端绑定）；续签换新格式后消除 |
| 前端拿到 instanceId 泄露 | 仅用于签发绑定，无敏感能力 | 非机密，可公开展示 |

## 8. 待确认项

1. **datasetEnhance 去留**：用户未提及。保留（现有 3 个定时任务 + 前端开关仍消费）还是移除（与 customTemplates 一起清理）？
2. **默认 true 范围**：全部功能（含 sso/pay）默认 true，还是仅新增功能（assistantGenerate/portal/sandboxSkills）默认 true？影响签发侧默认模板。
3. **评估命名**：`eval`（更通用，未来可扩展其他评估）还是保持 `batchEval`（避免改名迁移）？
4. **新功能命名**：辅助生成 / 门户 / 沙盒与技能 的英文字段名（暂定 `assistantGenerate` / `portal` / `sandboxSkills`）？
5. **version 语义**：`trial` 与 `official` 的差异规则？建议：trial = 功能全开 + 固定短过期时间 + UI 展示"试用版"标签；official = 正式授权。是否还需要 trial 专用配额档？
6. **新增功能是否接入 UI**：assistantGenerate/portal/sandboxSkills 当前无消费点，本期只做类型 + 展示，还是同时接导航/开关？
7. **签发工具**：仓库内无签发工具（私钥在官方），是否需要新建内部签发 CLI 以支持新结构、version、instanceId 签发与解绑？
8. **存量客户**：自动绑定实例（推荐）还是要求换新 license？
9. **instanceId 存储**：✅ 已确认（2026-08-31）：独立 type + `$setOnInsert` + 纯 DB（§6.4）；`licenseBind` 存在即校验（§6.6）
10. **签发服务部署位置**：独立私有仓库（推荐，私钥绝不进公开仓库）还是 pro/ 目录？
11. **签发鉴权**：保留 psw 签发人映射，还是升级管理员账号 + session？
12. **密钥对**：复用现有（公钥已在 auth.ts，存量兼容）还是更换（需验证侧双公钥灰度）？
13. **签发记录库**：MongoDB（原 laf 一致）还是 SQLite（轻量单机）？
14. **签发页面范围**：仅表单，还是含记录查询/重签/验证？

## 9. 签发服务重构

### 9.1 原签发云函数（Laf，仓库外，已记录）

```ts
// @lafjs/cloud 云函数，部署于 Laf 平台，FastGPT 官方内部使用
// 鉴权：psw 密码 → 签发人映射（余金隆/老根/王天赐/杨道升/深信服）
// 私钥：privateKey（laf 环境注入，不在代码中）
// 记录：MongoDB new_fastgpt_license 集合，含 creator 签发人审计
```

**流程**：

1. 校验：`psw` 在签发人映射中、`hosts` 非空数组、`expiredTime > startTime`、`functions` 为对象、`company` + `description` 必填
2. 构建 `licenseData`：`{ company, description, hosts, networkIds, maxUsers, maxApps, maxDatasets, functions }`
3. `payload = base64(JSON.stringify({ ...licenseData, startTime, expiredTime }))`
4. `signature = RSA-SHA256 签名(payload, privateKey, base64)`
5. `license = signature + payload`
6. 落库（含 creator）+ 返回 `{ license }`

**遗留问题**：

| 问题 | 说明 |
|---|---|
| `licenseType` 未进 payload | 入参有 `licenseType: "poc" \| "official"`，但构建 licenseData 时被丢弃，payload 无版本字段 |
| `networkIds` 无类型定义 | 进 payload（深信服网关），但 `LicenseDataType` 未声明 |
| `hosts` 必填校验 | 新方案换 `instanceId` 后校验对象变化 |
| functions 无默认值 | 签发侧必须写全 5 个开关，新功能上线要改签发工具 |
| 纯 API 无界面 | curl/Postman 操作，靠 psw 鉴权 |
| 记录只 insert | 无查询/重签/审计界面 |

### 9.2 新签发服务设计（Hono + JSX 页面）

**技术栈**：Hono + `@hono/node-server`（复用 code-sandbox 先例：Node 22 + tsx dev + vitest），`hono/jsx` 渲染页面。

**定位**：官方内部工具，独立部署（Docker）。**私钥不入仓库/镜像**——以环境变量 `LICENSE_PRIVATE_KEY` 或挂载 `private_key.pem` 注入。代码放独立私有仓库（FastGPT 为公开仓库，pro/ 亦在其中，私钥绝不能进）。

**页面（hono/jsx）**：

| 路由 | 功能 |
|---|---|
| `/` | 签发表单：company、description、version（trial/official）、instanceId（绑定）、startTime/expiredTime、limits（maxUsers/maxApps/maxDatasets）、functions 开关（默认全开，可关） |
| `/list` | 签发记录：分页、按 company 过滤、查看 payload 与 license、复制按钮 |
| `/verify` | 输入 license 字符串 → 公钥验签 + 展示 payload（排查/自检） |

**API**：

| 接口 | 说明 |
|---|---|
| `POST /api/license/create` | 签发：body = 新 LicenseDataType + psw，返回 `{ license, record }` |
| `GET /api/license/list` | 记录查询（鉴权 + 分页） |
| `POST /api/license/reissue` | 重签：客户换 instanceId / 延期，基于原记录生成新 license，旧记录保留 |
| `GET /api/license/verify` | 公钥验签 + payload 展示 |

**服务端校验**（签发前）：

- `version ∈ {trial, official}`，缺省 `official`
- `instanceId` 格式 32 位 hex（是否必填待定：trial 是否可免绑定）
- `startTime < expiredTime`
- `company` 必填
- `limits` 数值 ≥ 0
- `functions` 只接受已知键，未知键拒绝（防旧字段 `customTemplates` 混入）
- 功能开关 UI 默认全开，关闭需显式勾掉

**密钥管理**：

- 默认**复用现有密钥对**（公钥已在 `auth.ts`，换对 = 存量 license 全失效）
- 确需更换：验证侧支持双公钥（payload 加 `pubkeyVersion`，按版本选公钥），灰度过渡

**数据库**：

- MongoDB（原 laf 一致、FastGPT 生态一致）或 SQLite（单机工具更轻）
- 集合/表 `licenses`：`license`（全文）、`payload`（解析后）、`creator`、`company`、`instanceId`、`version`、`expiredTime`（索引）、`createTime`、`status`（active/revoked，仅内部审计标记，**无法远程吊销已签发 license**——离线验签体系决定）

**与验证侧配合**：

- 新签发结构 → `auth.ts` 归一化（§5.3）读取
- 公钥不变 → 存量 license 兼容
- instanceId 流程：客户提供实例 ID → 签发 → 激活（§6.5）

**部署**：

- Dockerfile（node:22-alpine + tsc build + @hono/node-server serve）
- 独立于 FastGPT 主仓库部署；内网/VPN 访问

### 9.3 签发服务风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 私钥泄露 | 可伪造任意 license | 不入仓库/镜像，env/挂载注入；签发记录审计（creator）；轮换流程 |
| 换密钥对 | 存量 license 全失效 | 默认复用现有对；确需更换走双公钥灰度（§9.2 密钥管理） |
| psw 弱鉴权 | 未授权签发 | 服务仅内网/VPN；页面 session；待确认加强方案（§8.10） |
| 签发记录丢失 | 审计缺失 | Mongo 持久化 + 备份 |
| 无法远程吊销 | 已发 license 无法作废 | 接受（离线体系固有）；记录 status 标记 + 到期自然失效；续费靠重签 |

## 10. 后续步骤

1. 确认 §8 决策
2. 按 AGENTS.md 流程：需求文档 → 开发文档 → TODO → 实施
3. 实施涉及文件：
   - `packages/global/common/system/types/index.ts`（类型重构）
   - `pro/admin/src/service/common/license/auth.ts`（归一化 + 默认 true + 实例校验）
   - app 侧 `getInstanceId` 工具（新）
   - `teamLimit.ts`、`authMaxUsers`（limits 路径）
   - `system/index.ts`（functions 新字段）
   - `LicenseData.tsx`（pro + app 展示层）
   - `AdminContainer.tsx`、`pro Navbar.tsx`（customTemplates 移除 + 新功能接入）
   - `pro/admin Header.tsx`（删除 hosts 校验）
   - app `components/admin/License/Input.tsx`（实例 ID 展示）
   - 官方签发工具（仓库外）
