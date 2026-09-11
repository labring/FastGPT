# 固定表头与表格滚动布局

## 需求与约束

模型表格迁移后，将主应用及管理后台其余业务表格统一接入固定表格组件。表头固定、内容独立滚动；已有分页器及批量操作栏放在滚动区外。保留分页请求、选择、编辑、动态列、合并单元格和滚动加载行为。

## 实现

- 默认不添加上下留白（`py={0}`），head/body 包装层默认左右留白 `px={4}`（16px），容器默认最小宽度 `24px`；调用方可显式覆盖。admin 全部 11 处表格明确设置 `px={0}`、`py={0}`，保留其页面外框与单元格内部间距。

- 默认内容包装层使用 `width: 100%`，取消全局 nowrap，允许长文本和连续字符串换行，优先在容器中分配列宽。`horizontalScroll` 显式启用内容自适应宽度与横向滚动；现有明确指定最小表宽的模型列表、模型配置、模型日志、渠道测试、模型仪表盘、价格提示、账单、团队审计共 8 处保留为显式宽表。

- `packages/web/components/common/FixedTable/index.tsx` 统一提供布局。
- `FixedTableLayout` 支持显式表头/表体，用于已有双表与虚拟列表；原有 ref、横向同步和滚动条宽度补偿继续生效。
- `FixedTableContainer` 是普通表格入口，调用方仍传入完整 Table，但公共组件把可见 Thead 放到滚动区外。表体通过不可见、零行高的原生表头副本保留自动列宽与合并单元格计算，再将测量结果同步给可见表头的 colgroup。副本不重复挂载 React 控件，禁用表单交互、去掉 ID/name，并在卸载时清理。
- 列宽使用浏览器原生 table 布局，不再计算期望宽度或执行自定义分配算法。公共组件只读取原生列边界同步给独立表头，不向 body 注入 colgroup 或强制 fixed 布局；保留调用方显式列定义。
- 表头铺满扣除左右 padding 的内容区，不额外扣减滚动条宽度、不插入补位 Box、不扩散表头背景。纵向滚动条占用 body 的右 padding：实际留白为 `max(0, paddingRight - scrollbarWidth)`。配置的右 padding 小于滚动条宽度时，header 右留白取两者最大值，防止负 padding 和列错位；滚动条消失或响应式尺寸变化时重新计算。移动端同样保持表体独立滚动。
- 外层负责尺寸、边框和上下留白。head/body 各自的包装 Box 承担横向 padding，head 内容层与 body 滚动层本身不加 padding；表头背景只绘制在包装 Box 内。body 包装 Box 放在唯一滚动区内部，保持滚动条贴右边缘，宽表横向滚到底仍保留左右留白。公开 ref 指向滚动区，`footer` 始终位于滚动区外。
- 滚动加载通过 `scrollContainer` 接入现有 `ScrollData`，将 `ScrollContainerRef` 传给它，避免再嵌套第二层滚动区。
- 页面表格占满剩余高度；内嵌编辑表自适应内容，默认最大 420px。账号页移动端表格限定高度，避免表头和分页器跟随长列表消失。
- 工作流内嵌表保留 `nodrag nowheel`，使滚动和编辑在表内完成。

## TODO 与验证

- [x] 所有普通表格统一为独立可见表头，保留自动列宽与动态列。
- [x] 清理三个内嵌模型表的表头独立横向滚动，统一账单/模型渠道/日志移动端滚动。
- [x] 核对 55 处普通表格和 13 处显式分离布局，无遗漏的原生业务 Table。
- [x] 浏览器验证动态列、合并表头、空表、滚动加载、固定列宽与横向滚动到底；380/600/900px 宽度检查列对齐。
- [x] 使用项目实际 theme 的 simple/workflow/bordered 表格，在 0.65/1/1.4 倍缩放下检查列宽；还原 DOMRect 的 transform 比例并合并浮点重复边界，避免工作流画布错列。
- [x] 本轮 3 个局部测试文件共 20 项测试通过；app/admin 类型检查通过；本轮 lint 零错误，AISettingModal 保留 React Hook Form 的兼容性警告。
- [ ] 登录态业务页面逐页人工验收（当前验证浏览器跳转登录页）。

- [x] 普通表格入口及滚动加载容器适配。
- [x] 主应用剩余表格迁移，分页器及批量操作栏归入 footer。
- [x] 管理后台表格迁移，保留触底加载。
- [x] 组件、分页相关局部测试及 app/admin 类型检查。
- [x] 浏览器检查固定表头、横向对齐、底部分页和滚动容器 ref。
- [x] 核对剩余 Table 引用：主应用新增迁移 44 处、管理后台 11 处，按模块交付清单。

验证边界：浏览器使用真实 React/Chakra 组件构造长表，验证普通与滚动加载两条路径的横纵滚动、动态列和 footer；本地应用页面需要登录，未逐一验收所有业务页面。局部 lint 中 NodeFormInput 的五处 `react-hooks/refs` 报错在 HEAD 版本也存在。

## 本轮逐项代码核对

以下 68 处均已检查 Table/Thead 接入结构及滚动、分页、动态列等特殊项；这是代码核对，不等同于已登录业务页的逐页人工验收。

| 调用点 | 布局 | 特殊项（已核对） |
| --- | --- | --- |
| `pro/admin/src/pages/audit/index.tsx:123` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/dashboard/active.tsx:131` | 普通分离 | 标准表格 |
| `pro/admin/src/pages/log/index.tsx:75` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/resources/apps/index.tsx:62` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/resources/datasets/index.tsx:39` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/settings/config/components/FormField/ExtraPointsPackages.tsx:183` | 普通分离 | 标准表格 |
| `pro/admin/src/pages/users/invoice/index.tsx:77` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/users/pays/index.tsx:167` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/users/plans/index.tsx:107` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/users/teams/index.tsx:69` | 普通分离 | 滚动加载 |
| `pro/admin/src/pages/users/users/index.tsx:82` | 普通分离 | 滚动加载 |
| `projects/app/src/components/core/ai/AISettingModal/index.tsx:294` | 显式分离 | 合并单元格 |
| `projects/app/src/components/core/ai/ModelTable/index.tsx:291` | 显式分离 | 固定底部、滚动 ref、合并单元格 |
| `projects/app/src/components/core/ai/PriceTiersLabel.tsx:80` | 显式分离 | 标准表格 |
| `projects/app/src/components/core/app/VariableEdit.tsx:101` | 普通分离 | 拖拽表体 |
| `projects/app/src/components/core/dataset/SearchParamsTip.tsx:40` | 普通分离 | 标准表格 |
| `projects/app/src/components/support/apikey/Table.tsx:620` | 普通分离 | 动态表头 |
| `projects/app/src/pageComponents/account/bill/ApplyInvoiceModal.tsx:201` | 普通分离 | 动态表头 |
| `projects/app/src/pageComponents/account/bill/BillTable.tsx:117` | 显式分离 | 固定底部、滚动 ref |
| `projects/app/src/pageComponents/account/bill/InvoiceTable.tsx:41` | 普通分离 | 固定底部、滚动 ref |
| `projects/app/src/pageComponents/account/customDomain/createModal.tsx:268` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/account/info/standardDetailModal.tsx:76` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/account/team/Audit/index.tsx:117` | 普通分离 | 固定底部、滚动 ref |
| `projects/app/src/pageComponents/account/team/GroupManage/index.tsx:124` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/account/team/Invite/InviteModal.tsx:104` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/account/team/MemberTable.tsx:288` | 普通分离 | 滚动加载 |
| `projects/app/src/pageComponents/account/team/OrgManage/index.tsx:170` | 普通分离 | 滚动加载 |
| `projects/app/src/pageComponents/account/team/PermissionManage/index.tsx:272` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/account/usage/UsageDetail.tsx:104` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/account/usage/UsageTable.tsx:149` | 普通分离 | 固定底部、滚动 ref |
| `projects/app/src/pageComponents/app/detail/Edit/HTTPTools/ManualToolModal.tsx:648` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Edit/HTTPTools/ManualToolModal.tsx:712` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal.tsx:212` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Logs/LogTable.tsx:534` | 普通分离 | 固定底部、滚动 ref、动态表头 |
| `projects/app/src/pageComponents/app/detail/Publish/DingTalk/index.tsx:115` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Publish/FeiShu/index.tsx:114` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Publish/Link/index.tsx:126` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Publish/OffiAccount/index.tsx:117` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Publish/Wechat/index.tsx:99` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/Publish/Wecom/index.tsx:131` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopRunStart.tsx:77` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopStart.tsx:102` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeExtract/index.tsx:76` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeFormInput/index.tsx:147` | 普通分离 | 拖拽表体 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeHttp/index.tsx:591` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/VariableTable.tsx:22` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolParams/index.tsx:48` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderToolInput/index.tsx:60` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/config/tool/SystemToolConfigModal.tsx:719` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/dashboard/mcp/EditModal.tsx:366` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/dataset/detail/CollectionCard/index.tsx:245` | 普通分离 | 固定底部、滚动 ref |
| `projects/app/src/pageComponents/dataset/detail/CollectionCard/TrainingErrorList.tsx:590` | 普通分离 | 滚动 ref |
| `projects/app/src/pageComponents/dataset/detail/Import/commonProgress/Upload.tsx:209` | 普通分离 | 固定底部 |
| `projects/app/src/pageComponents/dataset/detail/Import/components/RenderFiles.tsx:23` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/dataset/detail/Import/diffSource/ExternalFile.tsx:81` | 普通分离 | 标准表格 |
| `projects/app/src/pageComponents/model/AddModel.tsx:617` | 显式分离 | 滚动 ref、合并单元格 |
| `projects/app/src/pageComponents/model/Channel/index.tsx:160` | 显式分离 | 合并单元格 |
| `projects/app/src/pageComponents/model/Channel/ModelTest.tsx:198` | 显式分离 | 标准表格 |
| `projects/app/src/pageComponents/model/Log/index.tsx:211` | 显式分离 | 固定底部、滚动 ref |
| `projects/app/src/pageComponents/model/ModelChannelModal.tsx:147` | 显式分离 | 合并单元格 |
| `projects/app/src/pageComponents/model/ModelConfigTable.tsx:512` | 显式分离 | 固定底部、滚动 ref、合并单元格 |
| `projects/app/src/pageComponents/model/ModelDashboard/DataTableComponent.tsx:282` | 显式分离 | 标准表格 |
| `projects/app/src/pageComponents/model/ModelLinkedChannels.tsx:76` | 显式分离 | 合并单元格 |
| `projects/app/src/pageComponents/model/ModelPriceTiersTable.tsx:161` | 显式分离 | 标准表格 |
| `projects/app/src/pages/account/customDomain/index.tsx:111` | 普通分离 | 标准表格 |
| `projects/app/src/pages/dashboard/create/index.tsx:466` | 普通分离 | 标准表格 |
| `projects/app/src/pages/dashboard/evaluation/index.tsx:185` | 普通分离 | 固定底部、滚动 ref |
| `projects/app/src/pages/dashboard/mcpServer/index.tsx:104` | 普通分离 | 标准表格 |
