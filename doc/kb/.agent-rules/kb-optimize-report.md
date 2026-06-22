# 前端知识库修复报告

> 修复时间: 2026-06-18T19:50:00+08:00
> 知识库目录: doc/kb
> 评估报告: doc/kb/.agent-rules/kb-eval-report.md
> 修复范围: 全部 4 必修 + 6 可选

## 一、修复概览

| 统计项 | 数量 |
|-------|------|
| 评估报告必修问题 | 4 |
| 已修复 | 4 |
| 可选问题已修复 | 6 |
| 需人工处理 | 0 |
| 修复后 grep 自检通过率 | 100% |

## 二、按分组统计

| 分组 | 文档数 | 问题 | 已修复 | 修复率 |
|------|-------|------|-------|-------|
| G1 根目录 | 3 | 6 | 6 | 100% |
| G3 能力级 | 1 | 2 | 2 | 100% |
| G4 业务流程 | 1 | 1 | 1 | 100% |
| G6 跨文档 | 2 | 1 | 1 | 100% |

## 三、修复详情

### 必修问题

| # | 文档 | 类型 | 原问题 | 修复为 | 验证来源 |
|---|------|------|-------|-------|---------|
| 1 | 路由模型.md | 遗漏 | Auth 白名单遗漏 `/login/sso`、`/appStore`、`/tools/price` | 补充完整白名单：`/`, `/login`, `/login/provider`, `/login/fastlogin`, `/login/sso`, `/appStore`, `/chat`, `/chat/share`, `/tools/price`, `/price` | `auth.tsx:7-18` |
| 2 | 路由模型.md | 错误 | Token 失效例外表漏 `/chat` 路由 | 明确区分 Token 失效和余额不足的例外规则：`/chat` 仅 Token 失效时受保护 | `request.ts:115-135` |
| 3 | API索引.md | 错误 | 2 条 API 路径缺少 `/proApi/` 前缀 | 修正为 `/proApi/core/app/collaborator/update` 和 `/proApi/core/app/collaborator/delete` | `collaborator.ts:12,15` |
| 4 | 业务流程详解.md | 缺失 | 工作台/评测/业务流程详解.md 不存在 | 创建完整文档含 Mermaid 时序图和 API 汇总 | 评测模块源码 |

### 可选问题

| # | 文档 | 类型 | 修复内容 |
|---|------|------|---------|
| 5 | 路由模型.md | 偏差 | Navbar 高亮路径补充 PC/移动端差异：移动端不含 `/dashboard/skill`、`/skill/detail`，额外含评测子路由 |
| 6 | API架构.md | 偏差 | `animateResponseLoop` 公式修正为 `Math.max(1, Math.round(queue.length / 30))` |
| 7 | API架构.md | 遗漏 | Laf API 公共参数处理补充：同时删除 `null` 和 `undefined` 值 |
| 8 | 业务能力地图.md | 编码 | 17 个 `%20` 编码链接替换为空格 |
| 9 | 7 个旧文档 | Frontmatter | 添加完整 7 字段 frontmatter（capability_label/doc_type/doc_label/generated_at/parent_module/roles/router_paths） |

## 四、前后对比

| 指标 | 修复前 | 修复后 |
|------|-------|-------|
| 必修问题 | 4 | 0 |
| 可选问题 | 6 | 0 |
| 文档缺失 | 1 | 0 |
| Frontmatter 缺失 | 7 | 0 |
| %20 编码链接 | 17 | 0 |

## 五、下一步

- ✅ 全部必修问题已修复
- 建议运行 `/kb-eval-frontend --kb-path=doc/kb` 验证修复效果
- 预期总分提升至 95+
