---
name: doc-writing
description: 编写或修改 FastGPT 官方产品文档与部署运维文档（document/content/ 下的 MDX 页面）。涵盖提示高亮块（蓝色 Alert）、整屏标红截图、中英文双语成对维护、导航注册与校验流程。在新增教程、配置指南、功能说明或更新现有文档页面时使用；仅做翻译时使用 doc-i18n，仅做版本更新说明时使用 fastgpt-release-docs。
---

# FastGPT 文档编写规范

编写或更新 `document/content/` 下的 MDX 文档时，先遵守 [document/README.md](../../../../document/README.md) 与术语表 [document/CONTEXT.md](../../../../document/CONTEXT.md)，并执行本规范。

## 1. 提示与高亮块规范

- **提示、版本说明、范围补充等说明性内容，统一使用蓝色高亮块 `<Alert context="info">`**，不要使用普通 Markdown 引用块 `>`。
- 文件顶部导入组件：

```mdx
import { Alert } from '@/components/docs/Alert';

<Alert context="info">

提示内容写在这里，前后保留空行以正确解析 Markdown 语法（加粗、链接、列表等）。

</Alert>
```

- 其他语义按需选用，避免混用：
  - `context="info"`（蓝色，默认）：版本适用范围、前置说明、使用提示、补充说明。
  - `context="warning"`（黄色）：重要注意事项、破坏性操作或兼容性风险提示。
  - `context="error"`（红色）：高危警告、数据丢失或安全风险。
  - `context="success"`（绿色）：推荐实践或完成确认提示。

## 2. 截图与媒体规范

- **整屏截取**：界面配置与使用步骤截图需在真实运行环境中截取**完整整屏**（保留左侧导航或页面上下文），不要裁成缺乏定位上下文的局部碎片。
- **红框标注**：在截图中用清晰的**红色边框**圈出本次操作对应的导航入口、配置区块或关键开关，确保四条边框完整可见、不被视口边缘裁切。
- **脱敏与清理**：截图前隐藏开发模式浮层（如 `nextjs-portal`）、浏览器插件浮窗，替换或遮挡内网 IP、真实密钥、账号敏感信息。
- **资源存放与引用**：公共文档图片存放在 `document/public/imgs/<topic>/`，正文通过 `/imgs/<topic>/<name>.png` 引用并填写有语义的 `alt` 文本。英文文档共用中文界面截图时，正文中需清晰写出对应英文/界面路径说明，保证英文读者可直接理解。

## 3. 内容结构与导航

- **成对维护**：中文源文 `{name}.mdx` 与英文对应页 `{name}.en.mdx` 成对维护，保持前置条件、步骤、参数、限制与预期结果一致；英文翻译遵循 [doc-i18n](../i18n/SKILL.md)。
- **导航注册**：新增页面后同步更新同目录 `meta.json` 与 `meta.en.json`，将页面归入唯一的读者入口（使用指南 / 开发者 / 部署与运维）。
- **页面契约**：
  - 任务/配置教程：目标与适用版本 → 效果与生效范围 → 前置条件与操作步骤 → 关键参数/厂商说明 → 验证方式。
  - 参考/规范页：职责 → 请求与响应约定 → 字段表 → 可执行验证示例。
- **Frontmatter 与链接**：必填 `title`、`description`（含冒号时用引号包裹）；站内链接中文使用 `/self-host/...` 等显式路径，英文加 `/en/` 前缀。

## 4. 变更校验

修改完成后，在仓库根目录运行相关文档检查，确保链接、中英文结构与页面渲染无误：

```bash
node document/script/checkDocRefs.js
node document/script/checkEnglishDocs.mjs
```

涉及导航或大范围页面调整时，补充运行 `pnpm --dir document check:docs` 并在本地预览（`pnpm --dir document dev`）检查页面排版、蓝色提示块与截图显示效果。
