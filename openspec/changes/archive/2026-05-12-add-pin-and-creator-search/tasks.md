## 1. MongoDB Schema 新增 `isPinned` 字段

- [x] 1.1 在 `packages/service/core/app/schema.ts` 的 AppSchema 中新增 `isPinned: { type: Boolean, default: false }`
- [x] 1.2 在 `packages/global/core/app/type.ts` 的 AppListItemType 中新增 `isPinned?: boolean`
- [x] 1.3 更新 DB 索引：将 `{ teamId: 1, updateTime: -1 }` 改为 `{ teamId: 1, isPinned: -1, updateTime: -1 }`

## 2. 后端排序与搜索修改

- [x] 2.1 在 `projects/app/src/pages/api/core/app/list.ts` 中将排序改为 `.sort({ isPinned: -1, updateTime: -1 })`
- [x] 2.2 在 `list.ts` 的 handler 中，searchKey 非空时先查询 `MongoTeamMember` 匹配的 tmbId 列表
- [x] 2.3 将匹配的 `tmbId: { $in: tmbIds }` 加入 searchMatch 的 `$or` 条件

## 3. AppCard 菜单新增置顶操作

- [x] 3.1 在 `AppCard.tsx` 的 menuList（hasManagePer 段）中新增置顶/取消置顶菜单项
- [x] 3.2 置顶操作 icon 使用 `core/chat/setTopLight`
- [x] 3.3 已置顶时显示 `t('common:core.chat.Unpin')`，未置顶时显示 `t('common:core.chat.Pin')`（词条已存在，无需新增）
- [x] 3.4 点击后调用 `onUpdateApp` 切换 `isPinned` 状态，并刷新列表

## 4. 搜索框文案更新

- [x] 4.1 修改 `packages/web/i18n/zh-CN/app.json` 中 `search_name_intro` 为 "名称/描述/创建人"
- [x] 4.2 修改 `packages/web/i18n/zh-Hant/app.json` 中 `search_name_intro` 为 "名稱/描述/創建人"
- [x] 4.3 修改 `packages/web/i18n/en/app.json` 中 `search_name_intro` 为 "Name/Description/Creator"
- [x] 4.4 在 `index.tsx` 中确认 SearchInput 的 placeholder 引用的是 `t('app:search_name_intro')`（已有，无需改动）

## 5. AppCard 名称后展示置顶 Tag

- [x] 5.1 在 `AppCard.tsx` 标题行中，名称右侧新增 `MyTag` 组件，`colorSchema="primary"`，仅在 `app.isPinned` 时渲染
- [x] 5.2 Tag 文案使用 `t('common:core.chat.Pin')`（词条已存在）
- [x] 5.3 Tag 放置在名称与类型标签之间，`flexShrink={0}`，始终可见

## 6. 验证

- [x] 6.1 验证置顶操作：点击置顶后该应用排在列表最前面，再次点击取消置顶恢复原序
- [x] 6.2 验证文件夹也能置顶
- [x] 6.3 验证创建人搜索：输入创建人名称能搜出对应应用
- [x] 6.4 验证搜索框文案显示正确（三语种）
- [x] 6.5 验证向后兼容：旧数据（无 isPinned 字段）默认为 false，正常显示
