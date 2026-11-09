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
8. **SYNC_INDEX**：只处理当前 `deploy/version/main` 模板、生成文件和文档；历史版本部署文件单独判断，不盲删。

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

### D5. `SYNC_INDEX` — 已拍板：只清当前 main

- 清理 `deploy/version/main` 当前模板、生成文件和文档。
- 历史版本部署文件保持不动。
- 本次选择已明确授权修改当前 main 的部署 YAML。

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
- [ ] **B2（原第 7 项，P1，依赖 D1）旧 `basic`/`user` 页面和写接口**
  - 按评论建议：先盘点旧页面全部字段，区分“已迁移”“仍有用途”“废弃”；迁走仍有用途的字段后，再收口旧表单和 `/proApi/admin/system/updateConfig`，避免旧页面保存看似成功但实际被新配置覆盖。
  - 位置：`projects/app/src/pages/admin/settings/basic.tsx`、`user.tsx`、`projects/app/src/web/admin/system/api.ts`、`pro/admin/src/pages/api/admin/system/updateConfig.ts`
- [ ] **B3（原第 8 项，P2，依赖 D7）`plugin.remoteDebug` 无法关闭**
  - 管理员开关优先，探测只表示能力可用。
  - 位置：`projects/app/src/service/common/system/index.ts`
- [ ] **B4（原第 9 项，P3，依赖 D6）Sangfor 凭据回落**
  - 按 D6 结论保留并注释，或删除回落。
  - 位置：`packages/service/thirdProvider/sangfor/index.ts`

### 批次 C：字段收敛

#### C1. 无实际消费或历史残留

- [ ] **C1.1（原第 10 项，依赖 D2）`microsoft.customButton`**：接入登录按钮或删除。
- [ ] **C1.2（原第 11 项，P3，依赖 D8）`show_appStore`**：无消费，建议删除。
- [ ] **C1.3（原第 12 项，依赖 D3）`show_batch_eval`**：删除声明/赋值，或明确为 license 派生值。
- [ ] **C1.4（原第 13 项，P3，依赖 D8）`agentSandboxFree`**：界面使用 `show_agent_sandbox_free_tip`，删除旧字段。
- [ ] **C1.5（原第 14 项，P3，依赖 D8）`systemEnv.ip_whitelist`**：删除残留声明和旧表单控件。
- [ ] **C1.6（原第 15 项，P3，依赖 D8）`systemEnv.customDomain.domain.*`**：删除；实际读取 `feConfigs.customDomain.domain`。
- [ ] **C1.7（原第 16 项，P3，依赖 D8）旧 Pro 钉钉/支付宝类型**：确认无迁移/表单引用后删除旧类型。
- [ ] **C1.8（原第 17 项，依赖 D4）旧 Pro `auth.sms.*_EN`**：标记历史兼容或删除。
- [ ] **C1.9（原第 18 项，依赖 D5）`SYNC_INDEX`**：仅清理当前 main 模板/生成文件/文档。
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

- [ ] **R1（原第 26 项，P1）登录/注册方式派生未迁移**
  - 按评论建议：从新邮箱/短信配置重新推导 `login_method`、`find_password_method`、`bind_notification_method` 和手机号 `register_method`。
  - 位置：`packages/global/common/system/config/frontendProjection.ts`、`projects/app/src/web/admin/config/adapt.ts`、`projects/app/src/pages/api/common/system/getInitData.ts`
- [ ] **R2（原第 27 项，P1）解析 Provider `none` 语义**
  - 按评论建议：统一下拉选项、默认值和运行时语义；`none` 必须表示关闭外部解析，不按旧凭据回落。
  - 位置：`projects/app/src/pageComponents/admin/settings/providers/index.tsx`、`packages/service/common/file/read/utils.ts`
- [ ] **R3（原第 28 项，P2）`showCustomPdfParse` 推导**
  - 按当前选中的 Provider 判断，而不是只看旧凭据。
  - 位置：`packages/service/common/system/tools.ts`
- [ ] **R4（原第 29 项，P2）内容审核字段版本归属**
  - 对齐 Pro 实际支持范围，同步 registry、页面可见性和 API 权限。
  - 位置：`packages/global/common/system/config/registry.ts`、`packages/service/thirdProvider/fastgptPro/api.ts`
- [ ] **R5（原第 30 项，P2）`ENABLE_SAAS_ADMIN_CONFIG` 范围**
  - 恢复为仅控制配置展示；工单、企业认证入口按服务实际配置判断。
  - 位置：`pro/admin/src/service/admin/settings/hooks.ts`

### 批次 E：前端展示与测试

- [ ] **E1（原第 31 项，P2）`auth.fastLogin` 展示规则**
  - 按评论：仅当加载时既有配置非空显示编辑项和目录项；空配置不提供新建入口；显示状态不随当前编辑内容变化；隐藏时保存保留原值。
  - 位置：`projects/app/src/pageComponents/admin/settings/auth/index.tsx`
- [ ] **E2（原第 32 项，P3）StandardPlans/LegacyPlans 中文硬编码回退**
  - 按最新 review：恢复已有四语言静态翻译调用，覆盖配置按钮、定制套餐标题、取消/确认、名称、购买链接等。
  - 位置：`projects/app/src/pageComponents/admin/config/components/FormField/StandardPlans.tsx`、`LegacyPlans.tsx`
- [ ] **E3（原第 33 项，P3）合并丢失的 main 品牌测试**
  - 按最新 review：恢复约 14 个品牌 ENV 组合和 `initFastGPTConfig` 投影用例，保留本 PR 的实例配置场景。
  - 位置：品牌配置、`initFastGPTConfig` 相关测试文件
- [x] **E4（原第 34 项）PlanEditModal 测试**
  - 已完成：`b22b6a55f`，12 例通过；review 线程已回复并 resolve。

### 批次 F：文档与注释

- [ ] **F1（原第 35 项）`alipay.endpoint` 误标**：实际已传给 Pro `AlipaySdk`，删除“业务未接入”标记。
- [ ] **F2（原第 36 项）`SYNC_INDEX` 文档**：与 C1.9 一起处理，仍列为保留 ENV 的说明要删除。
- [ ] **F3（原第 37 项）`CHINESE_IP_REDIRECT_URL` 旧映射说明**：改为 ENV 权威描述。
- [ ] **F4（原第 38 项）过期注释**：清理已移除 ENV 兜底、旧页面、旧字段相关注释。
- 位置：`.agents/design/common/admin-instance-config-env-boundary.md` 及相关源码注释

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
