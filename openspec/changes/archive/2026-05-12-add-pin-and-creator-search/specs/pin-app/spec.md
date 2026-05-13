## ADDED Requirements

### Requirement: Application pin/unpin

AppCard 操作菜单 SHALL 提供置顶/取消置顶操作项，置顶的应用或文件夹排在列表最前面。

#### Scenario: 置顶一个未置顶的应用

- **WHEN** 用户点击未置顶应用的菜单中的「置顶」操作项
- **THEN** 该应用的 `isPinned` 设置为 `true`，列表重新排序后该应用排在所有未置顶应用之前

#### Scenario: 取消一个已置顶的应用

- **WHEN** 用户点击已置顶应用的菜单中的「取消置顶」操作项
- **THEN** 该应用的 `isPinned` 设置为 `false`，列表重新排序后该应用按更新时间排列

#### Scenario: 置顶一个文件夹

- **WHEN** 用户点击文件夹的菜单中的「置顶」操作项
- **THEN** 该文件夹的 `isPinned` 设置为 `true`，文件夹排在所有未置顶项之前

#### Scenario: 置顶排序规则

- **WHEN** 列表中存在多个已置顶的项
- **THEN** 已置顶的项按 `updateTime` 降序排列，然后未置顶的项按 `updateTime` 降序排列

#### Scenario: 向后兼容

- **WHEN** 旧数据没有 `isPinned` 字段
- **THEN** `isPinned` 默认为 `false`，正常显示在未置顶区域

### Requirement: Pin menu item presentation

置顶操作项 SHALL 展示正确的图标和文案。

#### Scenario: 置顶图标

- **WHEN** 置顶操作项在菜单中渲染
- **THEN** MUST 使用 `core/chat/setTopLight` 图标

#### Scenario: 置顶文案切换

- **WHEN** 应用 `isPinned` 为 `false`
- **THEN** 菜单项文案显示为「置顶」

#### Scenario: 取消置顶文案切换

- **WHEN** 应用 `isPinned` 为 `true`
- **THEN** 菜单项文案显示为「取消置顶」

### Requirement: Pin tag display on card

已置顶的应用/文件夹 SHALL 在卡片标题行名称右侧展示置顶 Tag。

#### Scenario: 已置顶应用显示 Tag

- **WHEN** 应用 `isPinned` 为 `true`
- **THEN** 卡片标题行名字右侧 MUST 渲染一个 `MyTag` 组件，`colorSchema="primary"`，文案为 `t('common:core.chat.Pin')`

#### Scenario: 未置顶应用不显示 Tag

- **WHEN** 应用 `isPinned` 为 `false` 或 `undefined`
- **THEN** 标题行中 MUST NOT 渲染置顶 Tag

#### Scenario: Tag 始终可见

- **WHEN** 应用已置顶
- **THEN** 置顶 Tag MUST 始终可见，不参与 type-tag / more-menu 的 hover 切换逻辑
