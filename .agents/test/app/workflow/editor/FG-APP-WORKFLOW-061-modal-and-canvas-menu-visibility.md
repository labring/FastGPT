---
case_version: 1
id: FG-APP-WORKFLOW-061
title: 工作流配置菜单在弹窗与缩放画布中可见且可操作
business: app/workflow/editor
category: boundary
types: [ui, e2e]
scenario: special
priority: P1
status: ready
tags: [workflow-editor, modal, menu, collaborator, zoom, 覆盖基础场景, 覆盖边界场景]
evidence: [ui, response]
sources:
  - packages/web/components/common/MyMenu/index.tsx
  - packages/web/components/core/workflow/NodeInputSelect.tsx
  - packages/web/components/v2/common/MyModal/index.tsx
  - projects/app/src/components/support/permission/MemberManager/MemberModal.tsx
  - projects/app/src/components/support/permission/MemberManager/RoleSelect.tsx
  - projects/app/src/pageComponents/app/detail/InfoModal.tsx
  - projects/app/src/components/common/secret/HeaderAuthConfig.tsx
  - projects/app/src/components/common/secret/HeaderAuthForm.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeHttp/index.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/Label.tsx
  - pro/admin/src/pages/api/core/app/collaborator/update.ts
  - pro/admin/src/pages/api/core/app/collaborator/list.ts
routes:
  - POST /api/proApi/core/app/collaborator/update
  - GET /api/proApi/core/app/collaborator/list
related: [FG-APP-WORKFLOW-049]
automation: []
baseline: 9c0534bea943327536b0cc1659d10ee3b3fa341a
---

# 工作流配置菜单在弹窗与缩放画布中可见且可操作

## 用例简介

在工作流中管理协作者、配置 HTTP 认证及切换节点输入方式，检查菜单越过弹窗正文边界时仍可阅读和选择。矮窗、窄屏和列表滚动不能截断权限选项，画布缩放后菜单仍跟随所属节点，已选择的权限能够保存并重新读取。

## 前置准备

- 使用现有本地 Dev 主站及已配置服务，不新建应用实例或数据库。记录 BASE_URL、运行进程所在 checkout、实际功能开关、界面语言和修复文件版本；本地 HEAD 不能替代 Dev 实际加载的源码。
- 在本轮新建的 `FG-TEST-*` 团队内准备 owner 和至少 5 个 active 普通成员。创建临时工作流，包含工作流开始、指定回复及一个不实际执行的 HTTP 请求节点；不调用模型或向外部地址发送请求。
- owner 为工作流所有者，其余成员初始均为仅对话协作者。保存 appId、teamId、tmbId 清单和协作者列表快照 D0；凭证仅保存在仓库外。
- 首次账号应先完成联系方式提示、系统消息和引导浮层的关闭，等待真实页面初始化完成。从应用信息/设置进入“管理协作者”；HTTP 请求节点的“鉴权配置”打开真实鉴权弹窗，选择 Bearer 或 Basic 后可切换手动输入/变量引用。指定回复节点用于画布输入类型对照。
- C1、C2 串行执行；C2 取消未保存修改，不覆盖 C1 的已保存权限。C3 完成后取消认证配置修改；C4 切回原输入方式。场景间关闭所有菜单及弹窗，恢复起始视口和画布缩放。
- AI 按真实界面执行并保留截图、菜单与触发器矩形、滚动位置、实际选项值及业务响应。菜单可见性需检查内容命中测试和滚动后选项可点击，不能仅依据 DOM 存在或 z-index。
- 结束后通过应用删除入口回收本轮工作流，再按明确 ID 清单清理本轮账号、团队及权限记录；保留脱敏证据和清理结果，不修改既有团队或共享配置。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；D0，桌面视口 | owner 打开管理协作者，将一个普通成员改为写权限并勾选查看日志，确认保存；关闭、刷新并重新进入，读取真实协作者列表，对比 owner、目标成员及其他成员。 |
| C2 | 边界场景；承接 C1 | 从桌面入口打开协作者弹窗，再分别切至 1280×640、390×667 CSS 像素视口，打开列表下部成员的权限菜单；记录菜单与正文边界，滚动菜单访问底部附加权限并切换，再滚动成员列表、点击菜单外部。点击 owner 的禁用权限控件作对照，最后取消本场景修改。窄屏入口布局本身不属于本例范围。 |
| C3 | 边界场景；关闭协作者弹窗 | 在 HTTP 节点打开认证配置，选择 Bearer 或 Basic，在 1280×640 视口切换手动输入/引用；核对公共菜单完整可见、实际选项可点击、选择后表单正确切换。关闭弹窗并放弃未保存配置，不发起 HTTP 请求。 |
| C4 | 兼容对照；关闭所有弹窗 | 在指定回复节点打开输入类型菜单，使用画布真实缩放控件或快捷键，在缩小、放大两个比例下分别重新打开。记录实际 transform、触发器和菜单几何、选项命中，选择变量引用后切回手动输入；点击经命中测试确认的空白画布，检查菜单关闭及原有连线保留。 |

## 预期结果

公共断言：菜单浮层的可读和可点击区域不被弹窗正文裁切。长菜单在自身内部滚动，打开菜单不会撑大正文滚动范围或使标题、确认按钮异常位移；关闭菜单不会关闭父弹窗。使用实际滚动、布局稳定及请求完成作为等待条件。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、真实 API | 目标成员保存为写权限与查看日志的组合；刷新后 UI 与列表响应一致。owner 仍为创建者且不能修改，其他成员权限与 D0 相同。 | 保存请求/业务响应、刷新后的列表快照、选中状态截图；只记录本轮成员标识与权限值。 |
| C2 | UI、几何与命中测试 | 两个视口中均能访问并操作底部权限，长菜单有自身滚动；浮层在可视视口内，成员列表滚动后仍与触发器对应。外部点击关闭菜单，owner 不会打开菜单；取消后已保存权限保持 C1 的结果。 | 每个视口的截图、菜单/正文/触发器矩形、scrollHeight/clientHeight、滚动轨迹及实际点击结果。 |
| C3 | UI | 认证弹窗内菜单没有被正文截断，切换后显示正确的输入控件；菜单外点击只关闭菜单，认证弹窗可继续操作。放弃后配置未被意外提交。 | 认证弹窗截图、选项命中、切换前后表单及关闭后的工作流配置。 |
| C4 | UI、配置对照 | 两个实际缩放比例下菜单与节点保持相同坐标系，位置贴近触发器、无明显偏移，选项可点击；点击节点外关闭。恢复输入方式后，节点与连线集合无意外增删。 | 实际画布 transform、各比例的菜单/触发器几何与截图、切换结果、前后节点与连线标识集合。 |
