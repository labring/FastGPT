# PR #7916 评论修复清单（按 review 建议优化）

- 基线：FastGPT `b22b6a55f`，Pro `5845bfa9`
- 参考：review `5799063192`、评论 `6708236008`、`6708377441`、`6716908328`，以及全部行内评论
- 结论：最新 review 唯一的 must-fix（PlanEditModal 测试）已完成；11-07 评论的“前两项”是套餐局部保存和套餐版本保护，应最先修。

## 一、评论给出的修复原则

1. **局部保存**：服务端在 revision 校验保护下合并域内已有 overrides，保留“显式清空 / 设回默认值”的语义；必须覆盖省略字段、空字符串、空数组和敏感字段掩码。
2. **套餐版本**：所有套餐写入口统一版本校验，套餐与对应版本一起读取；不能依赖商业配置页恰好同时提交 `commercial`，旧套餐写入路径也要纳入。
3. **Pro 刷新**：复用 App 的串行刷新方式，或用明确版本规则阻止旧结果覆盖；不新增分发系统，也不要求全节点确认。
4. **头像生命周期**：不要按旧提交快照直接删除对象；改为延迟回收并检查当前引用，同时避免“检查后又被重新引用”的新竞态；不要求扩展 S3 客户端重建方案。
5. **迁移容错**：必须展示被跳过/剔除的域和字段（脱敏），纳入升级验收；是否阻断升级按实际兼容要求逐项决定。
6. **ENV/config 互斥**：在最终合成处明确 ENV 权威，旧库值只作一次性迁移输入；仍需保留的旧字段先迁走，再收口旧表单和写接口。
7. **字段收敛判定**：先确认“最终业务实际消费”，不能只看声明或投影；无消费的删除并登记 overrides 清理，有消费但无入口的先决定归属再补 Schema/表单/页面映射。
8. **旧索引同步开关**：全仓移除该开关，包含 Marketplace、历史部署模板和升级说明；Marketplace 固定使用共享安全索引管理器。

## 二、需要先拍板的决策

### D1. 有消费但无新入口的字段归属（第 19-25 项）— 已拍板

| 字段 | 最终归属 | 版本/展示默认 | 说明 |
| --- | --- | --- | --- |
| `show_workflow_builder` | 新 `feature` 字段 | all | 前后端都读取；默认 `true` |
| `show_openai_account` | 新 `feature` 字段 | all | 账号第三方页和账户容器读取；默认 `false` |
| `enable_team_model` | 新 `feature` 字段 | all | 模型选择和后端禁用逻辑读取；默认 `false` |
| `customDomain.enable/domain.*` | 新 `site` 字段 | `isSaasOnly` | 旧页面明确标注“SaaS 服务才会用到” |
| `systemEnv.customDomain.kc/issuer/nginx.*` | ENV | Pro 部署 | Pro 证书/Ingress 基础设施，不进入实例配置 |
| `sso.title/icon/autoLogin/disablePasswordForSsoUsers` | 新 `auth.sso` 字段 | pro，按 license `functions.sso` 展示 | 登录页和账号同步仍在使用 |
| `customPdfParse.price` | `providers.documentParse.customPdf.price` | all | PDF 解析计费挂在解析 Provider 下 |
| `botIframeUrl` | 新 `site` 字段 | all | 客服助手 iframe 地址 |

版本/展示范围为实施默认值；如某个字段需要额外 SaaS 限制，在 C2 实现时单独标注。

### D2. `microsoft.customButton` — 已拍板：删除字段

- 删除 `auth.loginProviders.microsoft.customButton` 的 Schema、表单、registry/pageFields 和迁移映射。
- 登录按钮继续使用 `labels.microsoft`。

### D3. `show_batch_eval` — 已拍板：删除 feConfigs 标志

- 删除 `feConfigs.show_batch_eval` 声明和初始化赋值。
- 保留 license `functions.eval` 的业务授权逻辑。

### D4. 旧 Pro `auth.sms.*_EN` — 已拍板：标记历史兼容

- 保留旧类型和迁移读取，明确不再作为有效运行时配置。
- 新表单不再写入这些字段；后续清理时单独移除。

### D5. 旧索引同步开关 — 已拍板：全仓移除

- 清理所有部署模板、生成文件和文档中的旧开关。
- Marketplace 保留 defineIndex 声明与共享安全同步入口，移除启动开关。
- 用户已明确授权包含历史版本部署 YAML 的全仓清理。

### D6. Sangfor 回落 — 已拍板：删除回落

- 删除 `providers.documentParse.sangfor.url` 缺失时回落到旧 `customPdfParse` 的逻辑。
- Sangfor 必须使用自己的 `url/key`；缺失时按现有校验报错/不使用外部解析。

### D7. `plugin.remoteDebug` — 已拍板：管理员开关 AND 探测

- 最终值改为 `instanceConfig.subservice.plugin.remoteDebug && pluginRemoteDebug`。
- 管理员关闭后一定关闭；管理员开启但 Plugin 服务不支持时也不展示。

### D8. 无消费字段删除 — 已拍板：全部删除

- 删除 `show_appStore`、`agentSandboxFree`、`systemEnv.ip_whitelist`、`systemEnv.customDomain.domain.*`、旧 Pro 钉钉/支付宝类型。
- 删除时同步 registry、pageFields、旧类型、表单、迁移 cleanup 和测试；先确认无迁移/表单引用。

## 三、逐项执行清单

### 批次 A：数据一致性与并发（优先）

- [x] **A1（原第 1 项，P1）局部保存覆盖整域 overrides**
  - 已实现：controller 的 `updateDomainConfig` 与 `batchUpdateDomainConfigs` 都先宽松归一化已有 overrides，再与本次提交深合并；数组、标量、null 覆盖，普通对象递归合并，未提交字段保留。
  - 覆盖：省略字段、空字符串、空数组、敏感字段掩码、空对象 no-op、历史废弃字段剔除。
  - 位置：`packages/service/common/system/systemInstanceConfig/controller.ts`、`packages/service/test/common/system/systemInstanceConfig/controller.test.ts`
- [x] **A2（原第 2 项，P1）套餐缺少版本保护**
  - 已实现：套餐写入绑定 `commercial` revision；请求必须携带 `subPlansExpectedRevision`，页面提交前校验套餐 revision 与 commercial revision 一致；仅提交套餐时自动补空 commercial 更新加锁；旧 `updateConfig` 不再写入套餐，只保留最新套餐。
  - 位置：`packages/global/openapi/admin/system/instanceConfig/api.ts`、`packages/service/common/system/systemInstanceConfig/controller.ts`、`projects/app/src/pages/api/admin/system/config/update.ts`、`pro/admin/src/pages/api/admin/system/getConfig.ts`、`pro/admin/src/pages/api/admin/system/updateConfig.ts`、`projects/app/src/pageComponents/admin/settings/commercial/`
- [x] **A3（原第 3 项，P2）Pro 配置刷新乱序**
  - 已实现：Pro watch 内增加串行刷新队列，实例配置变更和重连补偿都走同一队列；旧读取完成后才执行下一轮，最终状态收敛到最新配置；不新增分发系统。
  - 位置：`pro/admin/src/service/middleware/volumnMongoWatch.ts`、`pro/admin/test/service/middleware/volumnMongoWatch.test.ts`
- [x] **A4（原第 4 项，P2）头像异步清理竞态**
  - 已实现：失去引用的头像改为写入 24 小时延迟删除 TTL，不立即删除；重新引用会移除 TTL 取消删除。S3 TTL 清理和最终删除任务都会重新检查当前 site 引用，配置读取失败时保留对象等待重试。
  - A→B→A 场景已覆盖；旧 `pro/admin` updateConfig 的即时头像删除随 B2 收口旧入口处理。
  - 位置：`packages/service/common/s3/sources/avatar/index.ts`、`packages/service/common/s3/siteAvatarReferences.ts`、`packages/service/common/s3/lifecycle/cleanup.ts`、`packages/service/common/s3/queue/delete.ts`、`projects/app/src/service/common/system/syncSiteAvatarLifecycle.ts`
- [x] **A5（原第 5 项，P2）迁移静默剔除/跳过**
  - 已实现：sanitize 和回填冲突都输出结构化路径清单（只含路径，不含值），迁移结果增加跳过数量/域数量/路径文本；管理端迁移结果新增黄色警告区展示路径。默认不阻断升级，便于人工复核。
  - 位置：`projects/app/src/migration/tasks/4180/20260928_migrate_instance_configs/service.ts`、同目录 `index.ts`、`projects/app/src/pageComponents/admin/config/Migration.tsx`、`packages/web/i18n/*/system_migration.json`

### 批次 B：配置来源与旧入口

- [x] **B1（原第 6 项，P1）`CHINESE_IP_REDIRECT_URL` 被旧配置覆盖**
  - 已实现：从 `defaultFeConfigs` 移除该字段，新增 `applyEnvAuthoritativeFeConfigs` 在最终合成处显式写回 ENV；旧库值不再能覆盖。
  - 位置：`projects/app/src/service/common/system/index.ts`、`projects/app/src/service/common/system/envAuthoritativeFeConfigs.ts`、`projects/app/test/service/common/system/envAuthoritativeFeConfigs.test.ts`
- [x] **B2（原第 7 项，P1）旧 `basic`/`user` 页面和写接口**
  - 已完成：旧 `basic/user/model/thirdParty` 路由改为重定向到新页面；旧 config 组件删除；`postUpdateConfig` 和 Pro `/proApi/admin/system/updateConfig` 写入口删除；`updateSystemConfig` 写 helper 删除。
  - 位置：`projects/app/src/pages/admin/settings/`、`projects/app/src/pageComponents/admin/config/`、`projects/app/src/web/admin/system/api.ts`、`pro/admin/src/pages/api/admin/system/updateConfig.ts`、`pro/admin/src/service/common/system/config.ts`
- [x] **B3（原第 8 项）`plugin.remoteDebug` 无法关闭**
  - 已按 D7 改为 `实例配置开关 && Plugin 能力探测`；管理员关闭后入口一定关闭。
  - 位置：`projects/app/src/service/common/system/index.ts`
- [x] **B4（原第 9 项）Sangfor 凭据回落**
  - 已按 D6 删除旧 `customPdfParse` 回落，只从 `providers.documentParse.sangfor.url/key` 成组取值。
  - 位置：`packages/service/thirdProvider/sangfor/index.ts`、`packages/service/test/thirdProvider/sangfor.test.ts`

### 批次 C：字段收敛

#### C1. 无实际消费或历史残留

- [x] **C1.1（原第 10 项）`microsoft.customButton`**：已按 D2 删除 Schema、表单、registry/pageFields、旧类型、迁移映射和公开投影；登录按钮继续使用 `labels.microsoft`。
- [x] **C1.2（原第 11 项）`show_appStore`**：已删除旧类型声明。
- [x] **C1.3（原第 12 项）`show_batch_eval`**：已按 D3 删除 `feConfigs.show_batch_eval` 声明和赋值，保留 license `functions.eval` 业务授权。
- [x] **C1.4（原第 13 项）`agentSandboxFree`**：已删除类型声明和运行时赋值，保留 ENV 驱动的 `show_agent_sandbox_free_tip`。
- [x] **C1.5（原第 14 项）`systemEnv.ip_whitelist`**：已删除 Schema、旧类型、旧表单/注释和 adapt 迁移逻辑。
- [x] **C1.6（原第 15 项）`systemEnv.customDomain.domain.*`**：已从旧 SystemEnv 类型删除；业务域名继续使用 `feConfigs.customDomain.domain`/新 site 字段。
- [x] **C1.7（原第 16 项）旧 Pro 钉钉/支付宝类型**：已删除旧 Pro/App 类型和旧支付宝 Notify URL 表单项。
- [x] **C1.8（原第 17 项）旧 Pro `auth.sms.*_EN`**：已按 D4 标记历史兼容，仅保留迁移读取，新表单不写入。
- [x] **C1.9（原第 18 项）旧索引同步开关**：已按 D5 清理当前 main 部署模板、生成文件和文档；Pro 当前 Helm chart 同步移除；历史 v4.16 文件也已清理。
- 统一验收：registry、pageFields、旧类型、表单、`20260929_cleanup_instance_config_deprecated_fields`、相关测试同步；存量 overrides 不因 strict schema 读取失败。

#### C2. 业务仍在用但没有新配置入口（依赖 D1）

- [x] **C2.1（原第 19 项）`show_workflow_builder`**：已补 `feature` 字段/表单/迁移/App 与 Pro 映射。
- [x] **C2.2（原第 20 项）`show_openai_account`、`enable_team_model`**：已补 `feature` 字段/表单/迁移/App 与 Pro 映射。
- [x] **C2.3（原第 21 项）`customDomain.enable/domain.*`**：已补 `site` 字段/表单/迁移/App 与 Pro 映射，按 SaaS-only 展示。
- [x] **C2.4（原第 22 项）`systemEnv.customDomain.kc/issuer/nginx.*`**：已迁 Pro ENV（CUSTOM_DOMAIN_*），旧值只保留迁移告警，不再被运行时读取。
- [x] **C2.5（原第 23 项）`sso.title/icon/autoLogin/disablePasswordForSsoUsers`**：已补 `auth.sso` 字段/表单/迁移/App 与 Pro 映射，按 license `functions.sso` 展示。
- [x] **C2.6（原第 24 项）`customPdfParse.price`**：已补 `providers.documentParse.customPdf.price`，页面、迁移和运行时价格读取均已接入。
- [x] **C2.7（原第 25 项）`botIframeUrl`**：已补 `site` 字段/表单/迁移/App 与 Pro 映射。
- 统一验收：逐字段矩阵有明确归属；仍需管理的字段可在当前菜单路径编辑，不依赖隐藏旧路由；不新增重复 ENV 来源。

### 批次 D：配置与消费规则一致性（R1-R5）

- [x] **R1（原第 26 项，P1）登录/注册方式派生未迁移**
  - 按评论建议：从新邮箱/短信配置重新推导 `login_method`、`find_password_method`、`bind_notification_method` 和手机号 `register_method`。
  - 位置：`packages/global/common/system/config/frontendProjection.ts`、`projects/app/src/web/admin/config/adapt.ts`、`projects/app/src/pages/api/common/system/getInitData.ts`
- [x] **R2（原第 27 项，P1）解析 Provider `none` 语义**
  - 按评论建议：统一下拉选项、默认值和运行时语义；`none` 必须表示关闭外部解析，不按旧凭据回落。
  - 位置：`projects/app/src/pageComponents/admin/settings/providers/index.tsx`、`packages/service/common/file/read/utils.ts`
- [x] **R3（原第 28 项，P2）`showCustomPdfParse` 推导**
  - 按当前选中的 Provider 判断，而不是只看旧凭据。
  - 位置：`packages/service/common/system/tools.ts`
- [x] **R4（原第 29 项，P2）内容审核字段版本归属**
  - 对齐 Pro 实际支持范围，同步 registry、页面可见性和 API 权限。
  - 位置：`packages/global/common/system/config/registry.ts`、`packages/service/thirdProvider/fastgptPro/api.ts`
- [x] **R5（原第 30 项，P2）`ENABLE_SAAS_ADMIN_CONFIG` 范围**
  - 恢复为仅控制配置展示；工单、企业认证入口按服务实际配置判断。
  - 位置：`pro/admin/src/service/admin/settings/hooks.ts`

### 批次 E：前端展示与测试

- [x] **E1（原第 31 项，P2）`auth.fastLogin` 展示规则**
  - 按评论：仅当加载时既有配置非空显示编辑项和目录项；空配置不提供新建入口；显示状态不随当前编辑内容变化；隐藏时保存保留原值。
  - 位置：`projects/app/src/pageComponents/admin/settings/auth/index.tsx`
- [x] **E2（原第 32 项，P3）StandardPlans/LegacyPlans 中文硬编码回退**
  - 按最新 review：恢复已有四语言静态翻译调用，覆盖配置按钮、定制套餐标题、取消/确认、名称、购买链接等。
  - 位置：`projects/app/src/pageComponents/admin/config/components/FormField/StandardPlans.tsx`、`LegacyPlans.tsx`
- [x] **E3（原第 33 项，P3）合并丢失的 main 品牌测试**
  - 按最新 review：恢复约 14 个品牌 ENV 组合和 `initFastGPTConfig` 投影用例，保留本 PR 的实例配置场景。
  - 位置：品牌配置、`initFastGPTConfig` 相关测试文件
- [x] **E4（原第 34 项）PlanEditModal 测试**
  - 已完成：`b22b6a55f`，12 例通过；review 线程已回复并 resolve。

### 批次 F：文档与注释

- [x] **F1（原第 35 项）`alipay.endpoint` 误标**：已删除“业务未接入”标记，标注实际传给 Pro `AlipaySdk`。
- [x] **F2（原第 36 项）旧索引同步开关文档**：已随 C1.9 删除当前 ENV 文档中的保留说明。
- [x] **F3（原第 37 项）`CHINESE_IP_REDIRECT_URL` 旧映射说明**：已改为 ENV 独占，不再迁移到 site。
- [x] **F4（原第 38 项）过期注释**：旧页面和旧字段组件已删除；剩余 ENV 相关注释已核对，未发现继续描述已移除兜底的内容。
- 位置：`.agents/design/common/admin-instance-config-env-boundary.md` 及相关源码注释

### 批次 G：最新 review 5824803968 收口

- [x] **G1（review F1，P2）PDF 新价格未进入 App 计费桥**
  - 已实现：`buildAuthoritativeSystemEnv` 用实例配置覆盖 `customPdfParse.price`；PDF 用量计算与 `createPdfParseUsage` 统一读取 `providers.documentParse.customPdf.price`；测试验证实例价格覆盖旧库值。
  - 位置：`projects/app/src/service/common/system/buildAuthoritativeSystemEnv.ts`、`packages/service/common/file/read/utils.ts`、`packages/service/support/wallet/usage/controller.ts`
- [x] **G2（review F2，P2）SSO 草稿未进入保存请求**
  - 已实现：auth 保存 payload 在 `showSso` 时显式带上 `sso`，与表单可见条件一致。
  - 位置：`projects/app/src/pageComponents/admin/settings/auth/index.tsx`
- [x] **G3（review F4，P2）重复维护两套配置写入规则**
  - 已实现：`updateDomainConfig` 改为 `batchUpdateDomainConfigs` 的单域薄适配层，删除单域独立合并/校验/剪枝/乐观锁实现；批量创建并发冲突继续映射 409。
  - 位置：`packages/service/common/system/systemInstanceConfig/controller.ts`
- [x] **G4（review F5，P2）新增公共 helper 多位置参数**
  - 已实现：`parseDomainOverrides`、`resolveDomainEffectiveConfig`、`restorePreservedSecrets`、`filterDomainDataByEdition`、`filterDomainDataByVisibleKeys`、`collectPrunedLeafPaths`、`findOverridesNotAllowedByEdition`、`registry.createEntries`、内部 `restoreObject`、迁移 `tryResolveConflictLeaf` 全部改为命名对象参数，并同步调用方。
  - 位置：`packages/global/common/system/config/`、`packages/service/common/system/systemInstanceConfig/controller.ts`、迁移 service 与相关测试
- [x] **G5（review F6，P2）头像 TTL 写 helper 未透传 session**
  - 已实现：`scheduleAvatarDeletion` 改为对象参数并支持可选 `session`，透传给 `MongoS3TTL.updateOne`。
  - 位置：`packages/service/common/s3/sources/avatar/index.ts`
- [x] **G6（review F7，P2）type.ts 先 import 再 export**
  - 已实现：删除 `SystemInstanceConfigDomainKey/Map` 转导出；消费方直接从 schema 导入。
  - 位置：`packages/global/common/system/config/type.ts`、相关页面
- [x] **G7（review F8，P3）OpenAPI 字段说明与示例**
  - 已实现：GET 响应 domain/revision/overrides/effectiveConfig/secretKeys/updatedBy 和更新请求 domain/expectedRevision/overrides/items/subPlans/subPlansExpectedRevision 补 description/example；补齐局部补丁、显式清空、套餐绑定 revision 示例。
  - 位置：`packages/global/openapi/admin/system/instanceConfig/api.ts`
- [x] **G8（review F3，P2，A4 补强）头像最终检查与远端删除之间仍可重新引用**
  - 已实现：新增 `s3_site_avatar_states` 对象级状态机（referenced/pending/deleting）：
    - 站点保存前先按新配置登记引用（带 revision），删除任务已领取时返回 409，保存不写库；登记后再校验对象存在，缺失返回 400 并清理状态。
    - TTL 清理只把 pending 状态提交删除队列；最终删除任务必须原子领取 pending→deleting 才能删除。
    - 旧保存的延迟回调通过 `savedRevision` 条件降级，不能覆盖新 revision 的引用；删除失败释放回 pending 供重试。
  - 覆盖：删除任务已领取时重新引用被拒绝；先引用后删除被跳过；过期 TTL 遇 referenced 状态不删除；S3 删除失败恢复 pending。
  - 位置：`packages/service/common/s3/models/siteAvatarState.ts`、`siteAvatarReferences.ts`、`cleanup.ts`、`queue/delete.ts`、`sources/avatar/index.ts`、`projects/app/src/pages/api/admin/system/config/update.ts`、`syncSiteAvatarLifecycle.ts` 及相关测试

### 批次 H：最新 review 5825692925 收口

- [x] **H1（review N1，P2）条件引用登记必须检查补偿 UPDATE 结果**
  - 已实现：reservation 改为最多 3 次条件写循环，只有 `matchedCount > 0` 或 create 成功才认为取得保护；补偿写 0 命中时重新协调，最终未命中返回 `SiteAvatarDeletionInProgressError`，不再凭前一次查询继续保存。
  - 位置：`packages/service/common/s3/siteAvatarReferences.ts`
- [x] **H2（review N2，P2）保存失败撤销本次预登记**
  - 已实现：预登记携带 `reservationId`；预检异常与批量事务失败都释放本次仍拥有且当前配置未引用的 referenced 状态；无法读取当前配置时保留状态，避免误释放已提交引用。清理任务无法回收时保留 TTL 作为重试记录，不再删除唯一入口。
  - 位置：`projects/app/src/pages/api/admin/system/config/update.ts`、`packages/service/common/s3/siteAvatarReferences.ts`、`packages/service/common/s3/lifecycle/cleanup.ts`
- [x] **H3（review N3，P2）同一 BullMQ 任务恢复已持有 claim**
  - 已实现：状态记录 `deleteClaimedBy`，worker 使用 `job.id` 作为 claimId；同一任务重试可恢复自己的 deleting，其他任务跳过；领取和删除统一放进 try/catch，批次中途失败会释放已领取 claim。
  - 位置：`packages/service/common/s3/queue/delete.ts`、`packages/service/common/s3/models/siteAvatarState.ts`
- [x] **H4（review N4，P2）session 覆盖头像调度全部 Mongo 写入**
  - 已实现：reserve/mark/claim/clear/release/getCurrent 等状态读写均支持并透传可选 session；`scheduleAvatarDeletion` 把同一 session 传给 pending 状态和 TTL 写入；新增真实 replica-set 事务中止回滚测试。
  - 位置：`packages/service/common/s3/siteAvatarReferences.ts`、`packages/service/common/s3/sources/avatar/index.ts`、`packages/service/test/common/s3/siteAvatarReferences.test.ts`
- [x] **H5（review N5，P3）删除无消费者的 Schema/type 别名**
  - 已实现：删除 `SystemInstanceConfigDocumentSchema`、`parseSystemInstanceConfigDocument`、`SystemInstanceConfigType`、`SystemInstanceConfigDocumentType`、`SystemInstanceDomainOverridesType`、`SystemInstanceDomainDocument` 等无消费者别名，保留实际定义。
  - 位置：`packages/global/common/system/config/schema.ts`、`packages/global/common/system/config/type.ts`
- [x] **H6（review N6，P3）监听器异常统一日志**
  - 已实现：快照监听器异常改用 SYSTEM logger 的 `{ error }` 结构化日志，保留逐监听器 catch 和继续通知其他订阅者。
  - 位置：`packages/service/common/system/systemInstanceConfig/runtime.ts`

## 四、已完成项（不重复修）

- PlanEditModal 测试兼容性：`b22b6a55f`，12 例通过，review 线程已 resolve。
- 历史行内问题：TTL 时序、Worker 版本回收、BullMQ 专用参数、续流保活、fastLogin JSON 误报、AI Proxy token、探测结果竞态、对象参数、循环上限复用等，最新 review 已确认保持修复。
- Pro 旧 review 两项：存储 bucket 重建和 `commercial.billingNotify` 短信投影，当前 Pro 代码已修复；仅旧线程未标 resolve。

## 五、建议执行顺序

1. **A1、A2**：评论明确建议优先处理，先解决数据覆盖和套餐并发。
2. **B1、R1、R2**：配置来源和登录/解析语义，影响面大且可独立验证。
3. **A3、A4、A5、B2、B3**：并发、迁移、旧入口收口。
4. **R3、R4、R5、E1、E2、E3**：规则一致性和前端/测试。
5. **D1-D8 拍板后**，再做 C1/C2 字段删除或补入口。
6. **F1-F4、C1.9**：文档和部署模板收尾。
