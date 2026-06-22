---
capability_label: 技能详情
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:40:00.000Z"
parent_module: 技能
roles: [拥有者, 协作者]
router_paths: ["/skill/detail"]
---

# 技能详情 — API索引

## 技能详情与操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/agentSkills/detail` | GET | 获取技能详情（含权限信息） | `src/web/core/skill/api.ts:37` → `detail/context.tsx:48` | 技能→技能详情→页面加载时调用 |
| `/core/agentSkills/update` | POST | 更新技能基本信息 | `src/web/core/skill/api.ts:44` → `detail/Header.tsx:68` | 技能→技能详情→编辑信息弹窗→确认提交时调用 |
| `/core/agentSkills/delete` | DELETE | 删除技能 | `src/web/core/skill/api.ts:51` → `detail/Header.tsx:58` | 技能→技能详情→删除确认弹窗→确认后调用 |
| `/api/core/agentSkills/export` | GET | 导出技能为 ZIP 压缩包 | `src/web/core/skill/api.ts:70` → `detail/Header.tsx:84` | 技能→技能详情→菜单→导出配置时调用（触发浏览器下载） |

## 权限与协作者管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/agentSkill/collaborator/list` | GET | 获取协作者列表 | `src/web/core/skill/collaborator.ts:9` → `detail/Header.tsx:228` | 技能→技能详情→权限设置弹窗→加载协作者列表时调用 |
| `/proApi/core/agentSkill/collaborator/update` | POST | 更新协作者权限 | `src/web/core/skill/collaborator.ts:12` → `detail/Header.tsx:230` | 技能→技能详情→权限设置弹窗→修改协作者权限时调用 |
| `/proApi/core/agentSkill/collaborator/delete` | DELETE | 删除协作者 | `src/web/core/skill/collaborator.ts:15` → `detail/Header.tsx:235` | 技能→技能详情→权限设置弹窗→移除协作者时调用 |
| `/proApi/core/agentSkills/changeOwner` | POST | 转让技能所有者 | `src/web/core/skill/api.ts:93` → `detail/Header.tsx:212` | 技能→技能详情→权限设置弹窗→转让所有者时调用 |
| `/core/agentSkills/resumeInheritPermission` | GET | 恢复从父级继承权限 | `src/web/core/skill/api.ts:89` → `detail/Header.tsx:221` | 技能→技能详情→权限设置弹窗→点击恢复继承时调用 |

## API 调用链追踪

### `GET /core/agentSkills/detail` 调用链

```
SkillDetailContextProvider
  ├── 触发: 页面加载 / skillId 变化（refreshDeps: [skillId]）
  ├── 参数: { skillId }
  └── 响应处理: 构建 AgentSkillDetailType（含 SkillPermission）；注入 SkillDetailContext；驱动 Header/Content 渲染
```

### `POST /core/agentSkills/update` 调用链

```
Header → 编辑信息弹窗确认
  ├── 触发: EditResourceModal onEdit 回调
  ├── 参数: { skillId, name, avatar, description }
  └── 响应处理: refreshSkillDetail() 刷新上下文数据；关闭编辑弹窗；Toast "编辑成功"
```

### `DELETE /core/agentSkills/delete` 调用链

```
Header → 删除确认弹窗确认
  ├── 触发: 输入技能名称匹配后点击确认
  ├── 参数: { skillId }
  └── 响应处理: router.push('/dashboard/skill') 返回技能列表；Toast "删除成功"
```

### `GET /core/agentSkills/export` 调用链

```
Header → 菜单 → 导出配置
  ├── 触发: 菜单项 onClick
  ├── 参数: skillId（URL query）、skillName（文件名）
  └── 响应处理: 浏览器下载 ZIP 文件；Toast "导出成功"
```

### `/proApi/core/agentSkill/collaborator/list` 调用链

```
ConfigPerModal → managePer.onGetCollaboratorList
  ├── 触发: 权限弹窗打开 / refreshDeps 变化
  ├── 参数: { skillId }
  └── 响应处理: 渲染协作者列表（角色、权限）
```

### `/proApi/core/agentSkill/collaborator/update` 调用链

```
ConfigPerModal → managePer.onUpdateCollaborators
  ├── 触发: 添加/修改协作者操作
  ├── 参数: { skillId, tmbId, role }
  └── 响应处理: 刷新协作者列表
```

### `/proApi/core/agentSkill/collaborator/delete` 调用链

```
ConfigPerModal → managePer.onDelOneCollaborator
  ├── 触发: 移除协作者操作
  ├── 参数: { skillId, tmbId }
  └── 响应处理: 刷新协作者列表
```
