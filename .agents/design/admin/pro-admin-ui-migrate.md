# Pro Admin UI 迁移到前台 App 管理员侧栏 — 设计方案

> 状态：**已确认，进入实施（方案 A）**
> 范围：**仅 UI 部分**（页面组件、导航壳层、路由、前端数据访问封装）
> 关联代码：`pro/admin/`（源）、`projects/app/`（目标）

### 实施进度（2026 更新）

**✅ 全部完成（P0~P3 UI 迁移 + 方案 B 后端接口迁移）**，tsc 全量 0 error、eslint 0 error（warning 为迁移代码风格警告，与 pro/admin 源一致）。

**方案 B 后端接口迁移（2026 追加）**：

- **T0**：`adminCert`（root 鉴权）迁移到 `projects/app/src/service/support/permission/`，复用 app 的 NextAPI middleware（无 licenseCheck）
- **T1（零依赖 18 个）**：users/teams/apps/datasets 列表与编辑、log、templates×6、templateType×3、audit adminList
- **T2（自包含 schema 10 个）**：dashboard×7、pays、invoice×2 + `MongoBill`/`MongoInvoice` schema（`service/support/wallet/bill/`）
- **T3（少量 service 7 个）**：plans×3 + `wallet/sub/controller`、`wallet/controller`（含 `global.reduceAiPointsQueue` 等声明，迁移到 `service/support/wallet/type.ts`）、inform×4 + inform controller（含 `sendInformQueue` 全局声明）；users addUser/delete（依赖 license auth + 账号注销/验证子系统：`common/license/auth`、`user/controller`、`account/cancellation` 全套、`verification/{code,oauth,wechat}`、`wecom/{const,utils,type,accessToken}`）
- **T4（settings/config 2 个）**：getConfig/updateConfig + `common/system/config`、`admin/settings/hooks`（adminEnv→process.env 适配）、`init.ts`（仅 applyProRuntimeFeConfigs）、`enterpriseAuth/env`、`admin/settings/type.ts`（SystemConfigType/ConfigStoreType 服务端类型）
- **新增依赖**：`@tanstack/react-table`、`nodemailer`、`@alicloud/*`、`xml2js`、`canvas`（catalog 注册）
- **类型适配**：`global.systemConfig` 宽类型断言（packages/service 声明为 `Record<string, unknown>`，迁移代码按 pro 结构本地断言）、`adminEnv`/`SMS_PROXY`/`BATCH_UPDATE_TIME`/`WECHAT_AUTH_TOKEN` 等 env → `process.env` 读取
- **验证**：dev server 实测所有迁移接口从 404 → 403（root 认证拦截）或 500（body 校验），路由真实存在；app 首页/登录正常。

**license 认证迁移（追加）**：激活/校验接口（`admin/common/license/active|auth`）+ 前端 License 输入组件（`components/admin/License/Input.tsx`）+ app `useSystemStore` 增加 `licenseData/initLicenseData/clearLicenseData` + `web/common/license/api.ts`。开源版后续可在未激活时提示购买商业版（LicenseInput 弹窗），迁移完成且接口实测 200/500（假 license 激活校验失败为预期）。

### 接口调用架构调整（2026 评审）：UI 改调 pro/admin 接口

**决策**：迁移后的 UI **不再调用 app 侧复制的接口**，改为通过 `/proApi` 代理调用 **pro/admin 服务的接口**（`FastGPTProUrl` 配置）。app 侧迁移的后端副本已删除，恢复开源版纯净。

**改动**：

- **前端 API 封装**（`web/admin/*`、`web/core/app/templates`、`web/common/system/inform`、`web/support/wallet/invoice`、`web/common/license`）所有接口路径加 `/proApi` 前缀；页面内直接调用的 `GET/POST('/admin/...')`（dashboard、plans/users/teams 的 modal 组件）同步加前缀。前端路由（`/admin/*` 跳转）不受影响。
- **降级逻辑**（`web/admin/common/request.ts`）：识别 `/proApi` 请求在 pro 服务未配置（500 + 未配置商业版链接 / ECONNREFUSED）或 404 时静默降级为空数据，保证开源版（不部署 pro/admin）页面骨架可渲染。
- **license 检测**（`web/common/license/api.ts`）：`getLicenseData` 识别降级空结构返回 `undefined`（视为未激活），保证开源版 root 正确触发激活/购买弹窗。
- **删除 app 侧迁移副本**：`pages/api/admin/{common,core,routes,support/user,support/wallet}`、`getFeConfigs.ts`、`getTemplateTypes.ts`、`pages/api/support/user/{audit,inform}`；`service/{admin,common/license,common/system/config*,core/changeOwner,init,support/permission/adminCert,support/user/account 迁移部分,support/user/controller,support/user/inform 迁移部分,support/user/team,support/wallet 迁移部分,support/wecom}`。**保留** app 原有：`appRegistration`、`initv*`、`dataClean`、`4160/4161`、`service/support/wallet/usage/utils.ts`（回退 git 原始版，仅 `authType2UsageSource`）、`service/support/user/account/password.ts`（误删后恢复）、`service/support/user/inform/api.ts`。

**结果**：UI 调 pro/admin 接口（单一后端，无双份漂移）；pro 服务未配置时开源版页面骨架可用 + root 弹 license 激活/购买提示。tsc 0 错误。

### 管理员主页（2026 新增）

- 侧栏**一级菜单项"管理员主页"**（`/admin/home`，位于审计日志之后）
- 页面展示：当前版本状态（开源社区版/商业版 Tag）+ 激活/变更 License 按钮 + license 详细信息（复用迁移的 `LicenseData` 组件）
- 未激活：显示开源版说明 + 激活按钮触发 LicenseInput；已激活：显示 license 完整信息（公司/过期时间/用户数/应用数/知识库数/功能开关）
- 依赖：`components/admin/License/{LicenseData,Input}.tsx`、`public/icon/user.svg`（从 admin 复制）

### 菜单结构调整（2026 评审）

- **系统工具**（/admin/config/plugin）、**模型提供商**（/admin/config/modelProvider）从"系统配置"子项提升为**独立一级菜单项**（位于系统配置之后、模板&工具之前）。原因：这两个是原有的 /config 能力（root 配置入口），与 pro/admin 迁移过来的"系统配置"子项（基础/功能/安全/第三方/用户）性质不同，独立成项更清晰。

### 剩余工作清单（2026 待办）

1. **LicenseInput 接入 app Layout**：组件已迁移（`components/admin/License/Input.tsx`）+ useSystemStore 已支持 license，但未在 app Layout 接入"未激活时弹 LicenseInput"逻辑（pro/admin 是 `!licenseData && <LicenseInput/>`）。接入后即可实现"开源版未激活提示购买商业版"（结合现有 ProModal）。
2. **迁移接口单测**：pro/admin 有 7 个迁移接口的测试（updateConfig/getPays/getPlans/updateUser/getUsers/getTeams/login），迁移到 `projects/app/test/api/admin/` 对应路径（接口与依赖已迁移，测试路径一致，主要改 import 的 mock 路径）。
3. **eslint warnings 清理**：50 个 no-unused-vars warning（迁移代码风格，不影响功能，可批量 `--fix` 或保留）。
4. **dev 端到端验证**：接口已实测（403 认证拦截 / 200 公开接口），但 root 登录后的完整 UI 流程（列表渲染、配置保存）需人工验证。
5. **audit 页面 getTeamMembers 依赖 /proApi**：app 既有行为（需 FastGPTProUrl 配置），非迁移引入。

关键产出：

- **侧栏壳层**：`SecondaryNavigationContainer` 增加两级分组能力（新组件 `components/SideTabs/Group.tsx`，向后兼容 account 页）；`pageComponents/admin/AdminContainer.tsx`（root 校验 + 两级菜单 + license 常量开关）
- **路由**：25 个 `/admin/*` 页面（dashboard 5 子页、users 5、resources 2、audit、inform、log、config 6 + plugin/modelProvider、templates 2）；旧 `/config/*` 重定向 + 三处旧跳转指向修正
- **通用组件**：`components/admin/`（BoxCard、markdown）、`pageComponents/admin/settings/`（表单系列）、`components/admin/Settings/PlanComponents.tsx`（迁移时把 `@tanstack/react-table` 加入 catalog）
- **前端 API 封装**：`web/admin/`（request 静默降级 + 各模块 api + config/adapt），`web/core/app/templates/api.ts`（类型内联），`web/common/system/inform/api.ts`，`web/support/wallet/invoice/api.ts`
- **配置页类型**：`pageComponents/admin/config/type.ts`（SystemConfigType/ConfigStoreType/ConfigFormType/TeamModeEnum 本地组装，去 pg 依赖与 declare global）

迁移中保留的技术债（未重构，避免行为变化）：

- `react-hooks/incompatible-library`（12 处，`watch()` 不能 memoize 的用法）与 `exhaustive-deps`（2 处）——pro/admin 源文件同样存在
- `@ts-expect-error`/`setState-in-effect` 等已在迁移文件中用行级注释处理并说明
- License 相关 UI（套餐/支付/开票/模板市场）侧栏默认隐藏，`AdminContainer` 中 `adminLicenseFunctions` 常量开关预留，商业版接入 license 时替换

### 已确认决策（2025 评审结论）

1. **API 策略：方案 B（全量迁移）** — 2026 评审后从方案 A 升级：UI 迁移完成且评审通过后，确认后端接口也需要全部迁移（用户选择"全部迁移"），使 `/admin/*` 接口在 app 后端真实可用（不再 404）。按 T1（零依赖）→ T2（自包含 schema）→ T3（少量 service）→ T4（深耦合 settings/config）分层推进，license/login 接口不迁。
2. **侧栏形态：两级分组侧栏** — 对齐 pro/admin 视觉，父级可展开子项；需扩展 `SecondaryNavigationContainer`（向后兼容，不影响 account 页）。
3. **现有 /config 并入 /admin/config** — 旧路由保留重定向；Navbar 的 root 入口替换为"管理"。
4. **移动端：仅 PC 提供管理员入口** — 移动端 navbarPhone 不加管理员入口。
5. **空数据态：静默降级** — 方案 A 阶段前端 request 封装对 `/admin/*` 接口统一拦截；方案 B 迁移完成后 404 变为真实响应，降级自动失效，前端封装无需改动。

---

## 1. 背景与目标

FastGPT 商业版（`pro/`）中有一个独立的管理后台应用 `pro/admin`（`@fastgpt/admin`，运行在 3001 端口）。它拥有自己的一套后端 API、登录认证和 License 系统，是一个完整的独立 NextJS 应用。

目标：把 pro/admin 的 **UI 部分**迁移到前台主应用 `projects/app` 中，以"管理员侧栏"的形式集成，使 root 用户在 app 内即可完成管理员操作，无需单独部署/访问 admin 应用。

本次任务范围明确为 **仅 UI**：迁移页面组件、导航壳层、路由挂载和前端数据访问封装；**后端 API 业务逻辑的迁移不在本次范围内**（详见 §8 风险与待确认项）。

## 2. 现状分析

### 2.1 pro/admin（源）结构

**应用骨架**

- `src/pages/_app.tsx`：QueryClient + ChakraProvider + SystemStoreContextProvider + appWithTranslation
- `src/components/Layout/index.tsx`：Header（60px 顶栏，含 Admin logo、License 信息、退出登录）+ Navbar（217px 左侧导航）+ 内容区
- `src/components/Layout/Navbar.tsx`：两级导航（带子菜单展开），8 大模块
- `src/components/Layout/Auth.tsx`：通过 `useAdminStore.initAdminInfo()`（`/admin/support/user/adminCert`）鉴权
- `src/store/useAdminStore.ts`：admin 登录态（zustand + persist）
- `src/web/common/system/useSystemStore.ts`：`licenseData` + `feConfigs`（License 系统，app 没有）

**导航模块（Navbar 的 LIST）**

| #   | 模块                            | 子项                                                       | License 控制                          |
| --- | ------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| 1   | 数据面板 /dashboard             | 全局统计/流量/付费/活跃/成本（页内 tab）                   | —                                     |
| 2   | 通知管理 /inform                | —                                                          | —                                     |
| 3   | 日志管理 /log                   | —                                                          | —                                     |
| 4   | 用户管理 /users                 | 用户信息/团队管理/套餐管理/支付记录/开票管理               | 后 3 项需 `licenseData.functions.pay` |
| 5   | 资源管理 /resources             | 应用管理/知识库管理                                        | —                                     |
| 6   | 系统配置 /settings/config       | 基础配置/功能清单/安全配置/第三方提供商/用户配置/套餐&充值 | 套餐&充值需 pay                       |
| 7   | 模板 & 工具 /settings/templates | 模板市场/工具箱                                            | 需 `customTemplates`                  |
| 8   | 审计日志 /audit                 | —                                                          | —                                     |

**页面/组件规模（纯 UI 部分）**

| 模块               | 页面文件                                                                                 | 行数  | 说明                           |
| ------------------ | ---------------------------------------------------------------------------------------- | ----- | ------------------------------ |
| dashboard          | 5 页 + Header.tsx + utils.ts                                                             | ~790  | 统计卡片 + tab 切换 + 日期范围 |
| inform             | 1 页                                                                                     | 350   | 系统通知/广告位管理            |
| log                | 1 页                                                                                     | 271   | 日志列表                       |
| users              | 5 页 + 7 个 modal 组件                                                                   | ~2432 | 用户/团队/套餐/支付/开票       |
| resources          | 2 页                                                                                     | 308   | 应用、知识库列表               |
| settings/config    | 6 页 + FormField×6 + FormLabel + ImportModal                                             | ~4830 | 最大模块，含通用表单组件       |
| settings/templates | 2 页 + 4 个组件                                                                          | ~1385 | 模板市场/工具箱                |
| audit              | 1 页                                                                                     | 302   | 审计日志                       |
| **通用组件**       | BoxCard / Pagination / markdown / Settings 表单系列                                      | ~1645 | 需一并迁移                     |
| **前端 API 封装**  | `web/admin/*/api.ts`、`web/core/config/api.ts`、`web/common/{license,system,file,i18n}/` | ~707  | 页面数据访问                   |

**页面通用模式**

```tsx
'use client';
import { GET } from '@/service/common/request';        // admin 自己的请求封装
import BoxCard from '@/components/common/BoxContainer/Card';
import { useRequest, usePagination } from '@fastgpt/web/hooks/...';
import { serviceSideProps } from '@/web/common/i18n/utils'; // SSR i18n
export async function getServerSideProps(content) { ... }   // 每个页面都有
```

- 绝大多数页面中文写死（62 个 tsx 中仅 7 个使用 i18n）
- 组件依赖集中在 `@fastgpt/web`（MyIcon/MyModal/useRequest/usePagination/useSystem），app 可用
- 数据全部来自 `/admin/...` 接口（见 §8.1）

### 2.2 前台 app（目标）现状

**导航骨架**

- `src/components/Layout/navbar.tsx`：64px 图标侧栏。现有入口：Chat / Studio / Datasets / Account，以及 root 用户的 **Config**（`/config/plugin/tool`、`/config/model`）
- `src/components/Layout/navbarPhone.tsx`：移动端底部栏
- `src/pageComponents/common/SecondaryNavigationContainer.tsx`：**账号与管理员页面共用的二级导航壳层**（PC 220px 固定侧栏 / 移动端顶部横向 tab）——直接复用为管理员侧栏
- `src/pageComponents/config/ConfigContainer.tsx`：root 的 Config 二级导航，目前 2 个 tab（plugin=系统工具、model=模型提供商）

**权限模型**

- 无独立 admin 认证；root 判定为 `userInfo?.username === 'root'`（Navbar、ConfigContainer 中已有先例）
- 无 License 系统（`useSystemStore` 无 `licenseData`）

**已有 admin API（app 后端）**

- 仅 init 迁移脚本类（`initv4xxx.ts`、`dataClean/*`、`4160/4161`），**没有 pro/admin 的运营管理接口**

## 3. 目标架构

```
projects/app
├── src/pages/admin/                  # 新增管理员路由树（root 可见）
│   ├── dashboard/index.tsx           # 数据面板
│   ├── inform.tsx                    # 通知管理
│   ├── log.tsx                       # 日志管理
│   ├── users.tsx / teams.tsx / plans.tsx / pays.tsx / invoice.tsx
│   ├── apps.tsx / datasets.tsx       # 资源管理
│   ├── config/                       # 系统配置（并入现有 /config 能力）
│   │   ├── basic.tsx / feature.tsx / model.tsx / thirdParty.tsx / user.tsx / pay.tsx
│   │   ├── plugin.tsx                # ← 现有 /config/plugin/tool 迁入
│   │   └── modelProvider.tsx         # ← 现有 /config/model 迁入
│   ├── templates/                    # 模板 & 工具（license）
│   └── audit.tsx                     # 审计日志
├── src/pageComponents/admin/         # 迁移的页面级组件（含模块私有子组件）
├── src/components/admin/             # 迁移的通用组件（BoxCard、Settings 表单系列等）
├── src/web/admin/                    # 迁移的前端 API 封装
└── src/pageComponents/common/AdminContainer.tsx   # 管理员二级导航壳层
```

**入口改造**

- `navbar.tsx`：root 用户新增"管理"图标（icon 复用 `common/administrator`），activeLink 覆盖 `/admin`
- 现有 `/config/plugin/tool`、`/config/model` 迁移进 `/admin/config/` 后，保留旧路由 302 跳转（避免破坏历史链接）
- 移动端 `navbarPhone.tsx` 同步加"管理"入口（或仅 PC 提供，待确认，见 §8.5）

## 4. 路由映射

| pro/admin（源）                                     | app（目标）                     | 说明                                                       |
| --------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| /dashboard（含 traffic/payment/active/cost 子 tab） | /admin/dashboard                | 页内 tab 保留                                              |
| /inform                                             | /admin/inform                   |                                                            |
| /log                                                | /admin/log                      |                                                            |
| /users/users                                        | /admin/users                    |                                                            |
| /users/teams                                        | /admin/teams                    |                                                            |
| /users/plans                                        | /admin/plans                    | license.pay                                                |
| /users/pays                                         | /admin/pays                     | license.pay                                                |
| /users/invoice                                      | /admin/invoice                  | license.pay                                                |
| /resources/apps                                     | /admin/apps                     |                                                            |
| /resources/datasets                                 | /admin/datasets                 |                                                            |
| /settings/config/basic                              | /admin/config/basic             |                                                            |
| /settings/config/feature                            | /admin/config/feature           |                                                            |
| /settings/config/model                              | /admin/config/model（安全配置） | 注意与现有 /config/model（模型提供商）重名，目标路由需区分 |
| /settings/config/thirdParty                         | /admin/config/thirdParty        |                                                            |
| /settings/config/user                               | /admin/config/user              |                                                            |
| /settings/config/pay                                | /admin/config/pay               | license.pay                                                |
| /settings/templates/app                             | /admin/templates/app            | license.customTemplates                                    |
| /settings/templates/toolkit                         | /admin/templates/toolkit        | license.customTemplates                                    |
| /audit                                              | /admin/audit                    |                                                            |
| —                                                   | /admin/config/plugin            | 现有 /config/plugin/tool 迁入                              |
| —                                                   | /admin/config/modelProvider     | 现有 /config/model 迁入                                    |

> 命名冲突提醒：pro/admin 的 `/settings/config/model` 是"安全配置"（安全校验相关），app 现有 `/config/model` 是"模型提供商"。迁入 /admin 后必须区分（建议 `model` = 安全配置，`modelProvider` = 模型提供商，具体命名待确认，见 §8.4）。

## 5. 管理员侧栏设计

复用 `SecondaryNavigationContainer` 作为壳层，新增 `AdminContainer.tsx`：

```
数据面板    admin/dashboard
用户管理    admin/users · admin/teams · admin/plans · admin/pays · admin/invoice
资源管理    admin/apps · admin/datasets
系统配置    admin/config/basic · feature · model · thirdParty · user · pay
           └ 系统工具(plugin) · 模型提供商(modelProvider)  [并入现有 Config]
模板&工具   admin/templates/app · toolkit                [license.customTemplates]
通知管理    admin/inform
日志管理    admin/log
审计日志    admin/audit
```

**结构差异与处理**

- `SecondaryNavigationContainer` 当前是**单层** tab 列表（SideTabs）；pro/admin 的 Navbar 是**两级**（父级可展开子项）。两个选项：
  - **A. 两级侧栏**：扩展 SideTabs/壳层支持分组（父项 + 子项），视觉与 pro/admin 一致 —— 推荐
  - **B. 扁平化**：8 个一级项平铺（数据面板/通知/日志/审计单独成项，用户/资源/系统配置展开为子项时用分隔线或二级分组）
- 选项 A 需要给 `SecondaryNavigationContainer` 增加分组能力；注意它同时被 account 使用，改动需向后兼容

**权限控制**

- `AdminContainer` 与 root 校验逻辑对齐 `ConfigContainer`：非 root 跳回 `/account/info`
- Navbar 的管理员入口仅 root 可见

## 6. UI 迁移清单

### 6.1 页面组件（pro/admin → app）

| 源                                                                    | 目标                                         | 备注                 |
| --------------------------------------------------------------------- | -------------------------------------------- | -------------------- |
| pages/dashboard/{index,traffic,payment,active,cost}.tsx               | pageComponents/admin/dashboard/\*            | 共用 DashboardHeader |
| pageComponents/core/dashboard/Header.tsx + utils.ts                   | pageComponents/admin/dashboard/Header.tsx    | tab + 日期范围       |
| pages/inform/index.tsx                                                | pageComponents/admin/inform/                 |                      |
| pages/log/index.tsx                                                   | pageComponents/admin/log/                    |                      |
| pages/users/users/\*（含 3 个 modal）                                 | pageComponents/admin/users/\*                |                      |
| pages/users/teams/\*（含 2 个 modal）                                 | pageComponents/admin/teams/\*                |                      |
| pages/users/plans/_、pays/_、invoice/\*                               | pageComponents/admin/{plans,pays,invoice}/\* | license              |
| pages/resources/apps,datasets                                         | pageComponents/admin/{apps,datasets}/\*      |                      |
| pages/settings/config/{basic,feature,model,thirdParty,user,pay}.tsx   | pageComponents/admin/config/\*               |                      |
| pages/settings/config/components/FormField/\*、FormLabel、ImportModal | pageComponents/admin/config/components/\*    |                      |
| pages/settings/templates/\*                                           | pageComponents/admin/templates/\*            | license              |
| pages/audit/index.tsx                                                 | pageComponents/admin/audit/                  |                      |

### 6.2 通用组件（pro/admin → app）

| 源                                                                                                                 | 目标                                   | 备注                             |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------- |
| components/common/BoxContainer/Card.tsx                                                                            | components/admin/BoxContainer/Card.tsx | BoxCard，被多数页面使用          |
| components/common/markdown/\*                                                                                      | components/admin/markdown/\*           | 通知管理使用                     |
| components/Pagination/index.tsx                                                                                    | components/admin/Pagination/           | 检查是否能直接复用 app 已有分页  |
| pageComponents/Settings/{SettingPage,FormItem,FormLabel,Input,Select,Switch,ImageInput,FirstTitle,SecondTitle}.tsx | pageComponents/admin/settings/\*       | 系统配置表单系列                 |
| components/common/License/\*                                                                                       | 不迁移                                 | app 无 License，逻辑替换（§7.4） |

### 6.3 前端数据访问封装

| 源                                                                   | 目标                           | 备注                            |
| -------------------------------------------------------------------- | ------------------------------ | ------------------------------- |
| web/admin/{apps,audit,common,config,datasets,pays,team,users}/api.ts | web/admin/\*/api.ts            | 接口前缀 `/admin/...` 保持不变  |
| web/core/config/{api,adapt,utils}.ts                                 | web/admin/config/\* 或直接并入 | dashboard 的 getInitFormData 等 |
| web/common/license/api.ts                                            | 不迁移                         | License 逻辑替换                |
| web/common/system/{useSystemStore,utils}.ts                          | 不迁移                         | 改用 app 的 useSystemStore      |

### 6.4 改造点汇总（源 → 目标差异）

| 项       | pro/admin                                          | app                                          | 处理                                                                      |
| -------- | -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| 请求封装 | `@/service/common/request` 的 GET/POST             | app 的请求方式（`@/web/common/api` / fetch） | 页面里 `GET(...)` 改写成 app 请求工具（封装一个 admin 专用 request 也可） |
| SSR i18n | 每个页面 `getServerSideProps` + `serviceSideProps` | app 页面多无 SSR i18n                        | 删除 getServerSideProps，`useClientTranslation` 按需                      |
| 认证     | `useAdminStore.initAdminInfo()`                    | `useUserStore` + `username==='root'`         | AdminContainer 层校验，页面不再各自鉴权                                   |
| License  | `useSystemStore.licenseData.functions.*`           | 无                                           | 默认关闭对应导航/UI（§7.4）                                               |
| 中文文案 | 写死                                               | 写死                                         | 本期保留写死中文，不做 i18n（§8.3）                                       |
| Icon     | MyIcon name（如 `support/user/userLight`）         | 同一套 @fastgpt/web MyIcon                   | 确认 app 侧 icon 集存在，缺的补到 app 的 icon 库                          |
| 路由跳转 | `router.push('/dashboard')` 等                     | `/admin/...`                                 | 统一改前缀                                                                |

## 7. 关键实现细节

### 7.1 请求层

app 内新增 `src/web/admin/common/request.ts`，封装 `GET/POST/DELETE` 指向 `/admin/...` 前缀接口，统一错误处理（对齐 app 现有 request 约定），页面迁移时把 `@/service/common/request` 替换为该封装，**接口路径保持与 pro/admin 一致**（后端迁移后即通，见 §8.1）。

### 7.2 AdminContainer 壳层

```
AdminContainer（/admin 下所有页面的父容器）
├─ 权限：非 root → router.replace('/account/info')（对齐 ConfigContainer）
├─ 侧栏：SecondaryNavigationContainer 扩展分组能力（选项 A）
└─ tab 定义：§5 的菜单结构，license 项按默认值隐藏
```

### 7.3 现有 Config 的并入

- `/config/plugin/tool` → `/admin/config/plugin`；`/config/model` → `/admin/config/modelProvider`
- `ConfigContainer` 的 tab 并入 AdminContainer 的"系统配置"分组
- 旧路由 `/config/*` 保留重定向（`router.replace` 或 next.config redirects），避免 root 用户历史书签失效
- Navbar 里 root 的 Config 入口替换为"管理"入口（activeLink 覆盖 `/admin` 与旧 `/config`）

### 7.4 License 相关 UI

app 无 licenseData。方案：AdminContainer 中维护一份常量开关（默认与开源版一致：`pay: false, customTemplates: false`），依赖项（套餐管理/支付记录/开票管理/模板&工具/套餐&充值 tab）**默认不渲染**；预留开关位，后续商业版接入 license 时替换为真实 licenseData。这样开源版 app 集成后不出现空页面。

### 7.5 移动端

`navbarPhone.tsx` 增加"管理"入口（root 可见），进入后侧栏走 SecondaryNavigationContainer 的移动端顶部横向 tab 模式。仪表盘子 tab（流量/付费/活跃/成本）在移动端用 FillRowTabs 横向滚动（pro/admin 已有先例）。

## 8. 风险、依赖与待确认问题

### 8.1 【关键决策】后端 API 处理策略（详细方案）

#### 8.1.1 关键架构事实（调研结论）

对 pro/admin 后端的深入调研发现以下事实，它们决定了选项空间：

**事实 1：两个应用共享同一 MongoDB 与同一套鉴权体系。**
pro/admin 的鉴权 `adminCert`（`pro/admin/src/service/support/permission/adminCert.ts`，仅 30 行）= 共享包 `@fastgpt/service` 的 `authCert` + `username === 'root'` 检查——与 app 前端的 root 判断**完全同源**。root 在 app 登录后，其 token 理论上可直接通过 adminCert。

**事实 2：API 层是薄壳，且 middleware 与 app 几乎等价。**
pro/admin 的每个 API handler 模式为 `NextAPI(adminCert + Mongoose 查询 + 返回)`。其 `NextAPI` middleware（`pro/admin/src/service/middleware/entry.ts`）与 app 的（`projects/app/src/service/middleware/entry.ts`）仅差一个 `licenseCheck`（全局 license 未激活则拒绝全部请求）。接口的业务逻辑大部分直接写在 handler 里，依赖共享包 schema（`@fastgpt/service/...`）。

**事实 3：pro/admin 的 service 层是独立实现，但 UI 只依赖其中一小角。**
`pro/admin/src/service/` 共 169 文件 / 2.4 万行，含 license、wecom、支付、SSO、k8s、bullmq 等重基础设施。但 UI 实际调用的接口只有约 **36 个**（见 8.1.2 分层），依赖的 pro 专属 service 文件仅约 10~15 个，且多为自包含（schema/controller 级）。

**事实 4：import 路径基本可平移。** pro/admin service 文件的 `@/service/...` 前缀在 app 中同样指向 `projects/app/src/service/`，adminCert 等文件可近乎原样放入 app。差异仅在 `@/global/...`（pro/admin 本地 global → app 需改 `@fastgpt/global/...`）、`@/env`（adminEnv → app env）等少数 alias。

#### 8.1.2 UI 依赖接口的依赖分层

| 层级                          | 接口（数量）                                                                                                     | 后端依赖                                                                            | 迁移难度                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| **T1 零依赖**                 | users CRUD×4、teams×3、apps×1、datasets×1、log×1、templates×6、templateType×3、audit adminList×1（约 **20 个**） | 仅 adminCert + 共享包 schema                                                        | 机械搬运，改 import                       |
| **T2 自包含 schema**          | dashboard×7、pays×1、invoice×2（约 **10 个**）                                                                   | + pro 专属 schema 文件（`MongoBill`(pays)、`MongoInvoice`），schema 本身自包含      | 低，需检查 app 侧 mongoose model 名无冲突 |
| **T3 少量 service**           | plans×3、inform×4（约 **7 个**）                                                                                 | + `wallet/sub/controller`、pro 版 `inform/controller`（含 templates）               | 中，需带 2~3 个 controller 及其传递依赖   |
| **T4 深耦合（不建议本期迁）** | settings(config)×2、license×2、login×1                                                                           | `applyProRuntimeFeConfigs`、license hooks、fastgptPro 配置体系、启动期 license 校验 | 高，牵涉 pro 的系统配置/启动体系合并      |

> 说明：login 接口不需要迁——root 在 app 内已有登录态；license×2 不迁——License UI 默认隐藏（§7.4）。settings/config 的两张页面（基础配置等）UI 可以先迁，接口后补，或整体放到最后一阶段与 T4 一起处理。

#### 8.1.3 候选方案对比

**方案 A：纯 UI，接口全部不迁**

- 范围：UI + 前端 API 封装（接口路径保持 `/admin/...` 不变）
- 结果：页面骨架/导航/交互可渲染，但所有数据请求 404，列表为空、表单提交失败
- 优点：范围最小，纯前端工作
- 缺点：**UI 迁移质量无法端到端验证**——分页、loading 态、错误提示、modal 提交后的刷新等行为全部验不了；后续接接口时几乎必然返工（真实错误码/数据形态和预期不符）；"验收完成"是假象
- 适合：只做视觉/结构评审，不打算让这批页面短期可用

**方案 B：UI + T1~T3 接口分层同步迁移（推荐）**

- 范围：UI + 前端封装 + 约 37 个轻中量接口 + adminCert + 约 10~15 个自包含 service/schema 文件；T4（settings config）与 license 不迁
- 落点：pro/admin 的 service 文件平移到 `projects/app/src/service/`（`@/service/...` import 路径不变），handler 平移到 `projects/app/src/pages/api/`（middleware 直接用 app 已有的 NextAPI，天然去掉 licenseCheck）
- 优点：**除系统配置页外全部页面端到端真实可用**；T1/T2 接口是薄壳机械搬运，风险低；adminCert 复用 app 已有 authCert，鉴权一致
- 缺点：超出"仅UI"字面范围，后端工作量约为 +30%（37 个薄壳接口 + 少量 schema）；需要做 mongoose model 注册冲突检查（pays、invoice 等 model 名在 app 侧确认不存在）；两处同名 service 需防止行为漂移（pro/admin 与 app 各一份 controller 的后续同步成本）
- 关键注意点：
  1. invoice 接口牵涉 `wecom/controllers/invoice` 与 `sendEmail`（T2/T3 边界），若依赖过重可降级为"先迁 UI 不迁接口"
  2. pro 专属 schema（如 MongoBill）与 app/packages 中已有 schema 是否重复注册同一 collection，迁移时逐一核对
  3. `readFromSecondary` 等查询选项依赖部署拓扑（secondary 节点），单机部署需确认行为

**方案 C：UI + 网关代理转发到独立 pro/admin 服务**

- 做法：app 的 `next.config.ts` 加 rewrites，把 `/admin/*`（及 `/support/user/audit` 等）转发到独立部署的 pro/admin 服务（环境变量 `ADMIN_SERVICE_URL`）
- 前提：两应用共享 MONGODB_URI 和同一 TOKEN 签名体系（事实 1 已验证鉴权同源，部署上需保证 TOKEN_KEY 一致）
- 优点：后端零迁移，页面**立刻全功能可用**（含 settings/license）；pro/admin 可独立演进；改动完全集中在 app 前端 + 部署配置
- 缺点：部署拓扑长期复杂化（永远多一个服务）；商业版交付物从"一个 app"变回"app + admin"，与"合并入口"的初衷部分矛盾；跨服务 cookie/CORS 需要配置正确
- 适合：pro/admin 在商业版部署中本来就会长期独立存在的场景，作为**过渡方案**

**方案 D：UI + 前端 mock 数据层**

- 做法：前端 API 封装内置 mock 开关（dev 环境返回假数据）
- 优点：可端到端演示，无后端工作
- 缺点：mock 维护成本高（36 个接口的数据形态都要造）；真实性差，验不出错误分支；后续仍需完整对接
- 评价：除非要做产品演示，否则性价比低于 B

#### 8.1.4 推荐与理由

**推荐方案 B（T1~T3 分层同步迁移），settings/config 页面与 T4 一起压到最后一个阶段。**

理由：

1. pro/admin 的接口是薄壳，T1 层 20 个接口基本是"改 import 就能跑"的机械工作，边际成本低（相对纯 UI 约 +30% 工作量，换来的是除配置页外全部页面可真实验证）
2. 方案 A 的"验收完成"无法兑现为可用功能，接口对接阶段的返工风险（loading/错误态/数据形态）会吞掉省下的工作量
3. 方案 C 可作为部署过渡手段保留——即使选 B，商业版部署上 pro/admin 与 app 短期并存时也可用 rewrites 兜底；但长期目标仍是后端合并，避免双份 service 漂移

若确认方案 B，实施顺序建议调整为：**T0 骨架（AdminContainer + Navbar）→ T1 接口+页面（users/teams/apps/datasets/log/audit/templates）→ T2（dashboard/pays/invoice）→ T3（plans/inform）→ 最后 settings/config UI+接口（T4）**。每个 T 层完成后即可端到端验收，风险逐层释放。

### 8.2 【关键决策】侧栏形态

- A. 两级分组侧栏（对齐 pro/admin 视觉，需扩展 SecondaryNavigationContainer）— 推荐
- B. 扁平单层侧栏（改动最小，但 8 模块 + 子项层级不直观）

### 8.3 【范围】i18n

- A. 保留写死中文（本次最小改动）— 推荐
- B. 迁移时接入 app i18n（工作量 +，涉及全部文案 key）

### 8.4 【命名】/admin/config 内页命名

pro/admin "安全配置"（model）与 app "模型提供商"（model）重名，需确定目标路由命名。

### 8.5 【范围】移动端管理员入口

- A. 仅 PC 提供管理员入口（移动端隐藏）— 推荐（管理员操作多在 PC）
- B. PC + 移动端都提供

### 8.6 其他风险

- app 与 pro/admin 的 `@fastgpt/web` 版本可能存在差异，迁移组件时需按 app 的依赖版本适配（usePagination/useRequest 签名等）
- pro/admin 依赖的 `@fastgpt/global/openapi/admin/*` 类型在 packages/global 中已存在，可直接复用，无需搬迁
- icon 资源：pro/admin 用到的 MyIcon name 需在 app 的 icon 集中核对，缺失的补齐

## 9. 建议实施步骤（评审后）

1. **P0 骨架**：新增 `/admin` 路由树 + AdminContainer 壳层 + Navbar 入口 + 旧 /config 并入与重定向；root 权限校验
2. **P1 通用组件**：BoxCard、Settings 表单系列、Pagination、markdown 迁入
3. **P2 核心模块**：dashboard（含子 tab）→ users → resources → audit（数据访问封装同步迁入）
4. **P3 其余模块**：inform → log → settings/config（6 页 + FormField 系列）→ templates
5. **P4 收尾**：移动端入口、icon 核对、空数据态、路由跳转复查
6. **验证**：root 登录 app → 管理员侧栏 → 各页面渲染；非 root 不可见；旧 /config 链接跳转正常
