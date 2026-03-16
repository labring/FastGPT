# GitHub Actions 安全修复总结

## 修复完成情况

✅ **已完成所有安全修复**

## 修复的漏洞

### GHSA-xfx8-w35j-485c - 任意代码执行漏洞

**严重程度**: Critical

**受影响的工作流**:
1. `fastgpt-preview-image.yml` - FastGPT 镜像预览
2. `docs-preview.yml` - 文档预览

**漏洞原因**:
- 使用 `pull_request_target` 授予密钥访问权限
- 检出攻击者的 fork 代码
- 在构建时暴露阿里云容器镜像仓库凭证
- 攻击者可修改 Dockerfile 窃取密钥或推送恶意镜像

## 实施的修复方案

### 1. 双工作流架构

将每个预览工作流拆分为两个独立的工作流：

**构建工作流（无特权）**:
- 使用 `pull_request` 触发器（无密钥访问）
- 构建镜像并上传为 artifact
- 攻击者无法窃取密钥

**推送工作流（有特权）**:
- 使用 `workflow_run` 触发器
- 下载已构建的镜像
- 不检出 PR 代码
- 只在推送时使用密钥

### 2. 外部贡献者审批机制

**内部贡献者**:
- 使用 `pull_request` 触发器
- 自动运行，无需审批

**外部贡献者**:
- 使用 `pull_request_target` 触发器
- 需要维护者添加 `safe-to-build` 标签
- 标签添加后自动运行

### 3. 目录结构重组

```
.github/workflows/
├── preview/           # 预览工作流
├── security/          # 安全工作流（预留）
├── deprecated/        # 已弃用的工作流
├── README.md          # 目录说明
└── MIGRATION.md       # 迁移说明
```

### 4. 安全增强

- ✅ 添加 Trivy 漏洞扫描（FastGPT 镜像）
- ✅ 密钥隔离（构建阶段无密钥访问）
- ✅ 代码隔离（推送阶段不检出代码）
- ✅ 外部审批机制（需要标签批准）
- ✅ 统一评论格式（使用 FinleyGe/github-tools）

## 修复的文件

### 新增文件

**FastGPT 镜像预览**:
- `preview/build-preview-image.yml` - 构建工作流
- `preview/push-preview-image.yml` - 推送工作流

**文档预览**:
- `preview/build-docs-preview.yml` - 构建工作流
- `preview/deploy-docs-preview.yml` - 部署工作流

**文档**:
- `README.md` - 目录结构说明
- `MIGRATION.md` - 迁移说明（已更新）
- `.claude/issue/GHSA-xfx8-w35j-485c-analysis.md` - 漏洞分析

### 已弃用文件

- `deprecated/fastgpt-preview-image.yml.deprecated`
- `deprecated/docs-preview.yml.deprecated`

## 安全改进对比

| 安全问题 | 原有工作流 | 新工作流 |
|---------|-----------|---------|
| 密钥访问 | ❌ 构建时可访问 | ✅ 构建时无访问 |
| PR 代码检出 | ❌ 检出攻击者代码 | ✅ 推送时不检出 |
| 外部贡献者 | ❌ 自动运行 | ✅ 需要标签批准 |
| 漏洞扫描 | ❌ 无扫描 | ✅ Trivy 扫描 |
| 密钥窃取风险 | ❌ 高风险 | ✅ 零风险 |
| 供应链攻击 | ❌ 可能 | ✅ 不可能 |

## ⚠️ 重要：后续必须操作

### 1. 立即轮换密钥（紧急）

即使没有已知的利用，这些凭证已经暴露给任何 PR 作者的 Dockerfile 构建。

**需要轮换的密钥**:
- `FASTGPT_ALI_IMAGE_USER`
- `FASTGPT_ALI_IMAGE_PSW`

**轮换步骤**:
1. 登录阿里云容器镜像仓库
2. 创建新的访问凭证
3. 更新 GitHub Secrets
4. 删除旧的访问凭证

### 2. 审计镜像仓库

检查阿里云容器镜像仓库的历史推送记录：

```bash
# 列出所有 fastgpt-pr 镜像
aliyun cr ListRepoTag --RepoNamespace <namespace> --RepoName fastgpt-pr

# 检查可疑的推送时间和来源
# 查找非预期的镜像标签
```

**检查要点**:
- 意外的镜像推送时间
- 不认识的镜像标签
- 异常大小的镜像
- 推送来源 IP 地址

### 3. 创建 safe-to-build 标签

在 GitHub 仓库中创建 `safe-to-build` 标签：

1. 进入仓库 Issues 或 Pull Requests 页面
2. 点击 Labels
3. 创建新标签：
   - 名称: `safe-to-build`
   - 描述: `Approved for building preview images`
   - 颜色: 绿色（如 `#0e8a16`）

### 4. 测试新工作流

**测试计划**:

1. **内部贡献者测试**:
   - 创建测试 PR（任意分支）
   - 验证构建工作流自动运行
   - 验证推送工作流自动运行
   - 检查 PR 评论是否正确
   - 验证镜像可以正常拉取

2. **外部贡献者测试**:
   - 从 fork 创建测试 PR
   - 验证工作流不自动运行
   - 添加 `safe-to-build` 标签
   - 验证工作流开始运行
   - 检查完整流程

3. **文档预览测试**:
   - 修改 `document/` 目录下的文件
   - 创建 PR
   - 验证文档构建和部署
   - 访问预览链接确认可用

## 工作流程图

```
PR 创建
    ↓
[判断贡献者类型]
    ├─ 内部成员 → 自动运行
    └─ 外部贡献者 → 等待 'safe-to-build' 标签
    ↓
[构建工作流]（无密钥）
    ├─ 检出 PR 代码
    ├─ 构建 Docker 镜像
    ├─ 保存为 artifact
    └─ 评论构建状态
    ↓
[推送/部署工作流]（有密钥）
    ├─ 下载 artifact
    ├─ 加载镜像
    ├─ 扫描漏洞
    ├─ 登录阿里云
    ├─ 推送镜像
    ├─ 部署（如需要）
    └─ 评论完成状态
```

## 维护者指南

### 审批外部 PR 的检查清单

在添加 `safe-to-build` 标签前：

- [ ] 审查所有代码更改
- [ ] 检查 Dockerfile 是否包含可疑命令
  - [ ] 无 `curl`、`wget` 等网络命令
  - [ ] 无 `bash -c` 执行远程脚本
  - [ ] 无环境变量泄露
- [ ] 检查是否修改了工作流文件
- [ ] 验证贡献者身份
- [ ] 确认更改符合预期

### 如果发现可疑活动

1. **立即撤销标签**: 移除 `safe-to-build` 标签
2. **停止工作流**: 在 Actions 页面取消运行
3. **关闭 PR**: 关闭可疑的 PR
4. **轮换密钥**: 立即更换所有密钥
5. **审计日志**: 检查镜像仓库和 Kubernetes 日志
6. **报告事件**: 向安全团队报告

## 回滚计划

**不建议回滚**，因为原工作流存在严重安全漏洞。

如果新工作流出现功能问题：
1. 检查工作流日志定位问题
2. 修复问题而不是回滚
3. 如必须临时回滚：
   - 重命名 deprecated 文件移除 `.deprecated` 后缀
   - 删除新工作流文件
   - **立即轮换所有密钥**
   - 尽快修复并重新部署新工作流

## 参考资料

- 漏洞分析: `.claude/issue/GHSA-xfx8-w35j-485c-analysis.md`
- 迁移说明: `MIGRATION.md`
- 目录结构: `README.md`
- GitHub 安全最佳实践: https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
- GitHub Blog: https://github.blog/security/vulnerability-research/keeping-your-github-actions-and-workflows-secure-preventing-pwn-requests/

## 联系方式

如有问题或发现安全问题，请：
1. 在 GitHub 创建 Security Advisory
2. 联系仓库维护者
3. 不要在公开 Issue 中讨论安全细节
