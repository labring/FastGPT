# FastGPT Skill 模板

此目录包含用于导出 FastGPT 应用为 Claude Skill 的通用模板。

## 文件说明

- **SKILL.md**: Skill 主文档模板,包含 YAML Frontmatter 和 Markdown 主体
- **package.json**: 依赖包配置文件,包含 axios 等必需依赖
- **scripts/chat.js**: FastGPT 聊天客户端封装脚本

## 依赖安装

导出的 Skill 需要 `axios` 依赖才能运行。

**重要提示**:
- 如果你的 Claude Code 环境中**已经全局安装了 axios**,则无需再次安装
- 如果环境中**没有 axios**,请在 Skill 目录下运行:
  ```bash
  npm install
  ```
- 建议先测试运行,如果提示 `Cannot find module 'axios'` 错误,再执行安装

## 模板位置

模板文件必须放在以下路径:
```
projects/app/public/fastgpt-to-skill-template/SKILL.md
```

这样在运行时可以通过 `process.cwd() + 'projects/app/public/fastgpt-to-skill-template/SKILL.md'` 访问。

## 模板变量

模板使用 `{变量名}` 占位符,在生成时会被替换为实际值。

详细的变量说明请参考根目录下的:
```
FastGPT/fastgpt-to-skill-template/README.md
```

## 注意事项

1. 不要删除此目录或 SKILL.md 文件,否则导出功能会报错
2. 修改模板后无需重启服务,下次导出会自动使用新模板
3. 模板必须符合 Claude Skill 官方规范 (YAML Frontmatter + Markdown)

## 相关代码

- 模板生成逻辑: `packages/service/core/app/skill/template.ts`
- ZIP 导出逻辑: `packages/service/core/app/skill/export.ts`
- API 端点: `projects/app/src/pages/api/core/app/exportSkill.ts`
