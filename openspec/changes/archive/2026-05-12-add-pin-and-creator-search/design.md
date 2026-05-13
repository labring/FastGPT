## Context

当前 FastGPT 的 Dashboard Agent 列表页有两个功能缺口:

1. **无置顶机制**: 应用/文件夹无法置顶，所有项统一按更新时间排序。用户高频使用的应用无法固定在列表顶部。
2. **搜索不支持创建人**: 搜索框仅支持按名称和介绍搜索，不包含创建人。当用户知道创建者但不知道应用名时，无法定位目标应用。

## Goals / Non-Goals

**Goals:**
- 在 AppCard 操作菜单中新增「置顶」操作项，点击后该应用/文件夹排在最前面
- 若已被置顶，操作项变为「取消置顶」
- 置顶状态为应用级别属性（方案 A），存在 App 表中
- 搜索框支持创建人搜索
- 搜索框提示文案改为「名称/描述/创建人」

**Non-Goals:**
- 不实现用户级别的个人置顶偏好
- 不改变现有的分页逻辑
- 不改变搜索防抖机制

## Decisions

### 1. 置顶实现: MongoDB 新增 `isPinned` 字段

- `AppSchema` 新增 `isPinned: { type: Boolean, default: false }`
- 后端排序改为 `.sort({ isPinned: -1, updateTime: -1 })`
- 复用现有 `putAppById` 接口切换置顶状态
- 置顶操作放在 AppCard 菜单的 `hasManagePer` 段
- Icon: `core/chat/setTopLight`

### 2. 创建人搜索: 两步查询方案

- 若 `searchKey` 非空，先从 `MongoTeamMember` 按 `name` regex 匹配，收集匹配的 `tmbId[]`
- 将 `{ tmbId: { $in: matchedTmbIds } }` 加入 app 查询的 `$or` 条件
- 无匹配创建人时不影响原有查询逻辑

### 3. 搜索文案: 修改国际化词条 `search_name_intro`

- 中文: "名称/介绍" → "名称/描述/创建人"
- 英文: "Name/Description" → "Name/Description/Creator"
- 繁体: "名稱/介紹" → "名稱/描述/創建人"

## Risks / Trade-offs

- **置顶字段无索引风险** → 排序使用 `isPinned`，建议添加复合索引 `{ teamId: 1, isPinned: -1, updateTime: -1 }` 替代现有 `{ teamId: 1, updateTime: -1 }`
- **创建人搜索多一次 DB 查询** → TeamMember 查询是轻量的 `_id` 投影查询，`name` 字段已有索引，性能影响可控
- **向后兼容** → `isPinned` 有默认值 `false`，旧数据不受影响
