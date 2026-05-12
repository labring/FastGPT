## Why

当前 Dashboard Agent 列表页不支持置顶功能，高频应用无法固定在列表顶部，且搜索仅支持名称和介绍，无法按创建人查找应用。

## What Changes

- AppCard 操作菜单新增「置顶/取消置顶」操作项，icon 为 `core/chat/setTopLight`
- MongoDB App Schema 新增 `isPinned` 字段，后端排序优先已置顶项
- 搜索框支持按创建人名称搜索
- 搜索框提示文案改为「名称/描述/创建人」

## Capabilities

### New Capabilities

- `pin-app`: 应用/文件夹置顶功能，置顶项排在最前面，可切换置顶/取消置顶
- `creator-search`: 搜索框支持按创建人名称搜索

### Modified Capabilities

<!-- None -->

## Impact

- `packages/service/core/app/schema.ts`: AppSchema 新增 `isPinned` 字段
- `packages/global/core/app/type.ts`: AppListItemType 新增 `isPinned` 类型
- `projects/app/src/pages/api/core/app/list.ts`: 排序改为置顶优先 + 创建人搜索支持
- `projects/app/src/pageComponents/dashboard/agent/AppCard.tsx`: 菜单新增置顶/取消置顶操作项
- `packages/web/i18n/zh-CN/app.json`、`zh-Hant/app.json`、`en/app.json`: `search_name_intro` 文案更新
