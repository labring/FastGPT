---
name: ci-workflow-sync
description: FastGPT CI workflow 双轨同步。当用户修改或新增 .github/workflows/ 下的 GitHub Actions workflow 时必须触发：同步更新 .forgejo/workflows/ 对应文件保持功能一致，或判断是否需要新建 Forgejo 版本。涉及 CI、GitHub Actions、Forgejo Actions、镜像构建、container registry、artifact、workflow yaml 改动、build-* workflow、test-* workflow 时也使用此技能。即使用户只提到"改一下 CI"或"加个 workflow"也应触发。
---

# FastGPT CI Workflow 双轨同步

FastGPT 同时维护两套 CI workflow：

- `.github/workflows/` —— 跑在 **GitHub 托管 runner** 上，发布到 ghcr.io + 阿里云 + Docker Hub，面向开源社区。
- `.forgejo/workflows/` —— 跑在 **内网 Forgejo + 自建 runner** 上，发布到 Forgejo 自带 registry，面向内网镜像分发。内网环境需要代理、镜像源、自建 registry。

两套同名 workflow 必须保持**功能一致**：构建步骤、测试逻辑、触发条件对齐。但 Forgejo 版本需要移除 GitHub 特有能力（attestations、github-script、PR 评论）并注入内网代理/镜像配置。

> 为什么这么做：内网 Forgejo runner 无法访问 ghcr.io / 阿里云 / Docker Hub 登录凭据，也没有 GitHub PR 评论 API；但构建和测试本身必须在内网跑通。所以不是"复制粘贴"，而是"等价改写"。

## 何时使用此技能

- 修改 `.github/workflows/` 下任意 workflow 文件
- 新增一个 `build-*.yml` / `test-*.yaml` workflow
- 改动涉及镜像 registry、artifact、permissions、runs-on、trigger
- 审查 PR 时发现只改了 GitHub 侧没动 Forgejo 侧

## 当前配对清单（改前先核对）

**已有 Forgejo 对应（9 个，改动时必须同步）：**

| GitHub | Forgejo | 类型 |
| --- | --- | --- |
| `build-fastgpt.yml` | ✅ | 镜像构建 |
| `build-code-sandbox.yml` | ✅ | 镜像构建 |
| `build-agent-sandbox.yml` | ✅ | 镜像构建 |
| `build-fastgpt-ide-agent.yml` | ✅ | 镜像构建 |
| `build-marketplace.yml` | ✅ | 镜像构建 |
| `build-mcp-server.yml` | ✅ | 镜像构建 |
| `test-fastgpt.yaml` | ✅ | 测试 + 覆盖率 |
| `test-sandbox.yaml` | ✅ | 测试 |
| `test-rust-agent.yaml` | ✅ | 测试（当前**完全一致**，无转换） |

> 清单会随仓库演进变化。每次动手前用 `ls .forgejo/workflows/` 核对实际文件，不要只信上表。

**仅 GitHub、当前无 Forgejo 对应（13 个，通常无需同步）：**

`auto-close-issue.yml`、`build-admin.yml`、`build-browser-sandbox.yml`、`build-docs.yml`、`build-sso-service-image.yml`、`helm-release.yaml`、`preview-admin-build.yml`、`preview-admin-push.yml`、`preview-docs-build.yml`、`preview-docs-push.yml`、`preview-fastgpt-build.yml`、`preview-fastgpt-push.yml`、`test-fastgpt-pro.yaml`

> 这些是 GitHub 专属能力（PR 预览部署、文档站构建、自动关 issue、Pro 版测试），内网不需要。但如果用户新建的是一个**构建镜像或跑测试**的 workflow，应主动询问是否需要新建 Forgejo 版本（见下方决策树）。

## 决策树

```
用户改了 .github/workflows/<name>
  │
  ├─ .forgejo/workflows/<name> 存在？
  │    ├─ 是 → 按【转换模式参考表】同步已有配对
  │    └─ 否 → 该 workflow 是否属于"构建 OCI 镜像 / 跑单元测试 / 内网需要复用"？
  │         ├─ 是 → 询问用户是否新建 Forgejo 版本；若同意，基于 GitHub 版本改写
  │         └─ 否（preview/docs/admin/helm/auto-close 等专属能力）→ 无需同步，告知用户原因
  │
  └─ 用户改的是 .forgejo/workflows/<name>（罕见）
       → 反向核对 .github/workflows/<name> 是否也需要对应改动
```

### 判断是否需要新建 Forgejo 版本

**通常需要：**
- `build-*.yml` —— 构建并推送 OCI 镜像（内网部署依赖）
- `test-*.yaml` —— 跑单元测试 / 集成测试（内网 PR 检查依赖）

**通常不需要：**
- `preview-*-push/build.yml` —— PR 预览部署到 GitHub Pages / Vercel
- `build-docs.yml` —— 文档站构建
- `helm-release.yaml` —— Helm chart 发布
- `auto-close-issue.yml` —— GitHub issue 自动关闭
- 任何强依赖 GitHub API（`actions/github-script`、PR 评论、`gh` CLI）的 workflow

拿不准时**问用户**，不要替用户决定。

## 转换模式参考表（GitHub → Forgejo）

下面 11 种模式是从仓库内真实 diff 提炼的。同步时逐条对照，**构建类 workflow 通常全部命中，测试类只命中部分**（如 `test-rust-agent.yaml` 当前两边完全一致，零转换）。

### 模式 1 · Container Registry 地址

GitHub 写死 `ghcr.io`，Forgejo 用 `${{ github.server_url }}` 动态推导 registry host。

```yaml
# GitHub
registry: ghcr.io
password: ${{ secrets.GITHUB_TOKEN }}
# outputs / tags 里
ghcr.io/${{ github.repository_owner }}/<repo>:<tag>

# Forgejo（需先在 step 里算出 REGISTRY）
- name: Set platform variables
  run: |
    REGISTRY="${{ github.server_url }}"
    REGISTRY="${REGISTRY#https://}"
    REGISTRY="${REGISTRY#http://}"
    echo "REGISTRY=${REGISTRY}" >> "$GITHUB_ENV"
    echo "SOURCE_URL=${{ github.server_url }}/${{ github.repository }}" >> "$GITHUB_ENV"
# 之后
registry: ${{ env.REGISTRY }}
password: ${{ secrets.REGISTRY_TOKEN }}
${{ env.REGISTRY }}/${{ github.repository_owner }}/<repo>:<tag>
```

### 模式 2 · 移除外部 registry 登录

GitHub 同时登录 ghcr.io + 阿里云 + Docker Hub 并打多组 tag；Forgejo 只登录自建 registry，**删除**阿里云、Docker Hub 的 login step 和对应 tag 环境变量。

```yaml
# GitHub（要删）
- name: Login to Ali Hub
  uses: docker/login-action@v3
  with:
    registry: registry.cn-hangzhou.aliyuncs.com
    username: ${{ secrets.FASTGPT_ALI_IMAGE_USER }}
    password: ${{ secrets.FASTGPT_ALI_IMAGE_PSW }}
- name: Login to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKER_HUB_NAME }}
    password: ${{ secrets.DOCKER_HUB_PASSWORD }}
# env 计算里
echo "Ali_Tag=..." >> $GITHUB_ENV
echo "Ali_Latest=..." >> $GITHUB_ENV
echo "Docker_Hub_Tag=..." >> $GITHUB_ENV
echo "Docker_Hub_Latest=..." >> $GITHUB_ENV
# TAGS 拼接里
TAGS="$(echo -e "${Git_Tag}\n${Git_Latest}\n${Ali_Tag}\n${Ali_Latest}\n${Docker_Hub_Tag}\n${Docker_Hub_Latest}")"

# Forgejo（只留 Git_*）
TAGS="$(echo -e "${Git_Tag}\n${Git_Latest}")"
```

### 模式 3 · Action 引用前缀

GitHub 用 `actions/*`，Forgejo 用 `forgejo/*`（Forgejo Actions 兼容 GitHub Actions 语法，但自有 action 镜像在 `forgejo` 命名空间下）。

```yaml
# GitHub
uses: actions/upload-artifact@v4
uses: actions/download-artifact@v4
uses: actions/github-script@v7   # Forgejo 没有对应，整个 step 要删或改写（见模式 10/11）

# Forgejo
uses: forgejo/upload-artifact@v4
uses: forgejo/download-artifact@v4
```

### 模式 4 · permissions 块

移除 GitHub 专有的 attestation / id-token / issue / PR 写权限。Forgejo runner 不做 SLSA 证明，也不写 PR 评论。

```yaml
# GitHub（要删的行）
permissions:
  attestations: write
  id-token: write
  issues: write
  pull-requests: write
# contents: read 通常两边都保留
```

### 模式 5 · 内网代理 + 镜像源注入

Forgejo runner 在内网，拉 docker.io / npm / apt 包都要走代理和镜像。每个**构建 job**开头都要加这两段。`vars.AB_*` 是 Forgejo 仓库变量。

```yaml
# Forgejo 每个 build job 开头加
- name: Capture proxy envs from variables
  run: |
    echo "HTTP_PROXY=${{ vars.AB_HTTP_PROXY }}" >> "$GITHUB_ENV"
    echo "HTTPS_PROXY=${{ vars.AB_HTTPS_PROXY }}" >> "$GITHUB_ENV"
    echo "NO_PROXY=${{ vars.AB_NO_PROXY }}" >> "$GITHUB_ENV"
    echo "APT_MIRROR_UBUNTU=${{ vars.AB_APT_MIRROR_UBUNTU }}" >> "$GITHUB_ENV"
    echo "APT_MIRROR_DEBIAN=${{ vars.AB_APT_MIRROR_DEBIAN }}" >> "$GITHUB_ENV"
    echo "APT_MIRROR_DEBIAN_SECURITY=${{ vars.AB_APT_MIRROR_DEBIAN_SECURITY }}" >> "$GITHUB_ENV"
    echo "NPM_REGISTRY=${{ vars.AB_NPM_REGISTRY }}" >> "$GITHUB_ENV"

- name: Write buildkitd config
  run: |
    REGISTRY_HOST="${{ github.server_url }}"
    REGISTRY_HOST="${REGISTRY_HOST#https://}"
    REGISTRY_HOST="${REGISTRY_HOST#http://}"
    echo "REGISTRY_HOST=${REGISTRY_HOST}" >> "$GITHUB_ENV"
    mkdir -p /tmp/buildkit
    cat > /tmp/buildkit/buildkitd.toml << EOF
    [registry."docker.io"]
      mirrors = ["mirrors.sangfor.com"]
    [registry."${REGISTRY_HOST}"]
      http = true
      insecure = true
    EOF
```

测试类 workflow 如果要下载外部二进制（如 MongoDB memory server），也要注入代理并预下载（见模式 11）。

### 模式 6 · buildx driver-opts + config

GitHub 用单行 `driver-opts: network=host`；Forgejo 要把代理、GODEBUG、buildkitd config 都塞进去。

```yaml
# GitHub
driver-opts: network=host

# Forgejo
driver-opts: |
  network=host
  env.GODEBUG=madvdontneed=0
  env.HTTP_PROXY=${{ env.HTTP_PROXY }}
  env.HTTPS_PROXY=${{ env.HTTPS_PROXY }}
  env.NO_PROXY=${{ env.REGISTRY_HOST }}
config: /tmp/buildkit/buildkitd.toml
```

构建 step 还要透传 build-args：

```yaml
# Forgejo docker/build-push-action
build-args: |
  HTTP_PROXY=${{ env.HTTP_PROXY }}
  HTTPS_PROXY=${{ env.HTTPS_PROXY }}
  NO_PROXY=${{ env.NO_PROXY }}
  APT_MIRROR_UBUNTU=${{ env.APT_MIRROR_UBUNTU }}
  APT_MIRROR_DEBIAN=${{ env.APT_MIRROR_DEBIAN }}
  APT_MIRROR_DEBIAN_SECURITY=${{ env.APT_MIRROR_DEBIAN_SECURITY }}
  NPM_REGISTRY=${{ env.NPM_REGISTRY }}
env:
  GODEBUG: madvdontneed=0
```

### 模式 7 · artifact 下载方式

Forgejo 的 `download-artifact` 不支持 `pattern` + `merge-multiple`，要**按 name 显式下载每个架构的 digest**。

```yaml
# GitHub（多架构 merge）
- uses: actions/download-artifact@v4
  with:
    path: ${{ runner.temp }}/digests
    pattern: digests-<repo>-${{ github.sha }}-*
    merge-multiple: true

# Forgejo（逐个下载，continue-on-error 防缺架构）
- uses: forgejo/download-artifact@v4
  with:
    name: digests-<repo>-${{ github.sha }}-amd64
    path: ${{ runner.temp }}/digests
- uses: forgejo/download-artifact@v4
  with:
    name: digests-<repo>-${{ github.sha }}-arm64
    path: ${{ runner.temp }}/digests
```

### 模式 8 · runs-on 矩阵默认值

GitHub 在 job 级用 `|| 'ubuntu-24.04'` 兜底；Forgejo 把默认值塞进 matrix 的每个条目里，job 级直接用 `matrix.runs-on`。

```yaml
# GitHub
strategy:
  matrix:
    archs:
      - runs-on: ubuntu-24.04   # 可能省略
      - runs-on: arm64-runner
runs-on: ${{ matrix.runs-on || 'ubuntu-24.04' }}

# Forgejo
strategy:
  matrix:
    archs:
      - runs-on: ubuntu-24.04   # 每条都要显式写
      - runs-on: arm64-runner
runs-on: ${{ matrix.runs-on }}   # 不兜底
```

### 模式 9 · 构建类 workflow 的 workflow_dispatch 版本输入

GitHub 只靠 tag 触发；Forgejo 额外支持 `workflow_dispatch` 手动传版本号，并在版本解析脚本里分支处理。

```yaml
# Forgejo 顶层 on
on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Image version tag (e.g. v1.0.0)'
        required: true
        type: string

# 版本解析 step（用 step output 传给下游 job）
- name: Validate release version
  id: version
  env:
    EVENT_NAME: ${{ github.event_name }}
    REF_TYPE: ${{ github.ref_type }}
    TAG_VERSION: ${{ github.ref_name }}
    INPUT_VERSION: ${{ github.event.inputs.version }}
  run: |
    if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
      VERSION="$INPUT_VERSION"
    elif [[ "$REF_TYPE" == "tag" ]]; then
      VERSION="$TAG_VERSION"
    else
      echo "::error::Workflow must be triggered by a tag or workflow_dispatch. Current event: ${EVENT_NAME}"
      exit 1
    fi
    if [[ ! "$VERSION" =~ ^v ]]; then
      echo "::error::Version must start with v. Current value: ${VERSION}"
      exit 1
    fi
    echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
```

### 模式 10 · 删除 detect-changes job（github-script）

GitHub 用 `actions/github-script@v7` 跑一段 JS 根据 PR 改动文件决定跑哪些测试 scope；Forgejo 没有 github-script，**整个 detect-changes job 删掉**，下游 job 移除 `needs: detect-changes` 和 `if: needs.detect-changes.outputs.*` 条件，改为总是跑全部 scope。

```yaml
# GitHub（整个 job 删）
detect-changes:
  runs-on: ubuntu-latest
  outputs:
    run_global: ${{ steps.scope.outputs.run_global }}
    # ...
  steps:
    - uses: actions/github-script@v7
      with:
        script: |
          // 根据 PR 文件判断 scope...

# 下游 job
test-global:
  needs: detect-changes
  if: ${{ needs.detect-changes.outputs.run_global == 'true' }}

# Forgejo
test-global:            # 无 needs，无 if
test-service:           # 无 needs，无 if
test-app:               # 无 needs，无 if
report-coverage:
  needs: [test-global, test-service, test-app]
  if: ${{ always() }}   # 不再依赖 should_report
```

### 模式 11 · PR 覆盖率评论改写为 Step Summary

GitHub 用 `actions/github-script` 调 `github.rest.issues.createComment` 在 PR 上贴覆盖率表格；Forgejo 没有 PR 评论 API，改成**内联 node 脚本写入 `GITHUB_STEP_SUMMARY`**（仅出现在 workflow run 摘要里，不贴到 PR）。同时 artifact 下载也要改成按 name 逐个下载 + `continue-on-error`。

```yaml
# GitHub
- uses: actions/download-artifact@v4
  with:
    path: coverage-artifacts
    pattern: coverage-*
- name: Report Coverage
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const path = require('path');
      // ... 拼 markdown 表格
      await core.summary.addRaw(body).write();
      await github.rest.issues.createComment({ ... });

# Forgejo
- uses: forgejo/download-artifact@v4
  with:
    name: coverage-global
    path: coverage-artifacts/coverage-global
  continue-on-error: true
- uses: forgejo/download-artifact@v4
  with:
    name: coverage-service
    path: coverage-artifacts/coverage-service
  continue-on-error: true
- uses: forgejo/download-artifact@v4
  with:
    name: coverage-app
    path: coverage-artifacts/coverage-app
  continue-on-error: true
- name: Generate Coverage Summary
  if: github.event_name == 'pull_request'
  run: |
    node -e "
    const fs = require('fs');
    const path = require('path');
    // ... 同样拼 markdown 表格
    fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY, body, { flag: 'a' });
    "
```

测试类 workflow 下载 MongoDB memory server 等外部二进制时也要走代理：

```yaml
# Forgejo test job 额外加
- name: Capture proxy envs from variables
  run: |
    echo "HTTP_PROXY=${{ vars.AB_HTTP_PROXY }}" >> "$GITHUB_ENV"
    echo "HTTPS_PROXY=${{ vars.AB_HTTPS_PROXY }}" >> "$GITHUB_ENV"
    echo "NO_PROXY=${{ vars.AB_NO_PROXY }}" >> "$GITHUB_ENV"
    echo "MONGOMS_DOWNLOAD_DIR=$HOME/.cache/mongodb-binaries" >> "$GITHUB_ENV"
- name: Pre-download MongoDB binary
  run: |
    MONGODB_VERSION="7.0.14"
    CACHE_DIR="$HOME/.cache/mongodb-binaries/mongodb-linux-x86_64-ubuntu2204-${MONGODB_VERSION}"
    if [ -f "${CACHE_DIR}/mongod" ]; then
      echo "MongoDB binary already cached"; exit 0
    fi
    mkdir -p "${CACHE_DIR}"
    curl --proxy "${{ vars.AB_HTTP_PROXY }}" -sL \
      "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-${MONGODB_VERSION}.tgz" \
      | tar xz -C /tmp
    cp /tmp/mongodb-linux-x86_64-ubuntu2204-${MONGODB_VERSION}/bin/mongod "${CACHE_DIR}/mongod"
```

## 完整 Before/After 片段

以 `build-fastgpt.yml` 的 release job registry 登录段为例（真实 diff 截取）：

```yaml
# === GitHub 原版 ===
  release:
    needs: build
    runs-on: ubuntu-24.04
    permissions:
      packages: write
      attestations: write        # ← Forgejo 删
      id-token: write            # ← Forgejo 删
    steps:
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Login to Ali Hub           # ← Forgejo 整段删
        uses: docker/login-action@v3
        with:
          registry: registry.cn-hangzhou.aliyuncs.com
          username: ${{ secrets.FASTGPT_ALI_IMAGE_USER }}
          password: ${{ secrets.FASTGPT_ALI_IMAGE_PSW }}
      - name: Login to Docker Hub        # ← Forgejo 整段删
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_HUB_NAME }}
          password: ${{ secrets.DOCKER_HUB_PASSWORD }}
      - uses: actions/download-artifact@v4
        with:
          pattern: digests-${{ matrix.sub_routes.repo }}-${{ github.sha }}-*
          merge-multiple: true

# === Forgejo 同步后 ===
  release:
    needs: build
    runs-on: ubuntu-24.04
    permissions:
      packages: write
      # 无 attestations / id-token
    steps:
      - name: Set platform variables
        run: |
          REGISTRY="${{ github.server_url }}"
          REGISTRY="${REGISTRY#https://}"
          REGISTRY="${REGISTRY#http://}"
          echo "REGISTRY=${REGISTRY}" >> "$GITHUB_ENV"
          echo "SOURCE_URL=${{ github.server_url }}/${{ github.repository }}" >> "$GITHUB_ENV"
      - name: Capture proxy envs from variables
        run: |
          echo "HTTP_PROXY=${{ vars.AB_HTTP_PROXY }}" >> "$GITHUB_ENV"
          echo "HTTPS_PROXY=${{ vars.AB_HTTPS_PROXY }}" >> "$GITHUB_ENV"
          echo "NO_PROXY=${{ vars.AB_NO_PROXY }}" >> "$GITHUB_ENV"
          # ... 其余 AB_* 变量
      - name: Write buildkitd config
        run: |
          # ... 写 buildkitd.toml（见模式 5）
      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.REGISTRY_TOKEN }}
      # 无 Ali Hub / Docker Hub login
      - name: Download digests
        uses: forgejo/download-artifact@v4
        with:
          name: digests-${{ matrix.sub_routes.repo }}-${{ github.sha }}-amd64
          path: ${{ runner.temp }}/digests
      - uses: forgejo/download-artifact@v4
        with:
          name: digests-${{ matrix.sub_routes.repo }}-${{ github.sha }}-arm64
          path: ${{ runner.temp }}/digests
```

## 同步操作流程

1. **读 GitHub 版**：打开 `.github/workflows/<name>`，理解它做什么。
2. **diff 现有配对**：若 `.forgejo/workflows/<name>` 已存在，先 `diff` 两边看当前差异基线，再叠加用户的 GitHub 侧改动。
3. **逐条套转换模式**：按【转换模式参考表】1→11 顺序对照，构建类通常全命中，测试类部分命中。
4. **保留业务逻辑不变**：构建步骤、测试命令、矩阵维度、版本号计算逻辑应一致，只改"在哪里跑/推到哪/用什么 action"。
5. **YAML 校验**：同步后用 `python -c "import yaml; yaml.safe_load(open('.forgejo/workflows/<name>'))"` 或 `actionlint` 验证语法（仓库未强制，但能避免低级缩进错误）。
6. **告知用户**：列出本次同步改了 Forgejo 侧哪些点，以及是否有 GitHub 专有能力被删除（需用户确认内网确实不需要）。

## 验证清单

- [ ] `.forgejo/workflows/<name>` 与 `.github/workflows/<name>` 的**构建/测试业务步骤**一致。
- [ ] Forgejo 版本无 `ghcr.io` 硬编码，改用 `${{ env.REGISTRY }}`。
- [ ] Forgejo 版本无阿里云 / Docker Hub login step 及对应 tag 变量。
- [ ] 所有 `actions/*` 引用已换成 `forgejo/*`；`actions/github-script` step 已删除或改写。
- [ ] `permissions` 块里没有 `attestations: write` / `id-token: write` / `issues: write` / `pull-requests: write`。
- [ ] 构建 job 开头有 "Capture proxy envs" + "Write buildkitd config" 两步。
- [ ] buildx `driver-opts` 是多行格式并带代理 + `config: /tmp/buildkit/buildkitd.toml`。
- [ ] artifact 下载用 `forgejo/download-artifact` 按 name 显式下载，无 `pattern` / `merge-multiple`。
- [ ] `runs-on` 矩阵每条都显式写了 runner，job 级用 `matrix.runs-on` 无兜底。
- [ ] 构建类 workflow 的 `on:` 里有 `workflow_dispatch.inputs.version`，版本解析脚本处理了 `workflow_dispatch` 分支。
- [ ] YAML 语法校验通过。
- [ ] 若删掉了 GitHub 专有能力（PR 评论、attestation、ali/docker hub 推送），已在回复里告知用户。

## 反模式（不要做）

- ❌ 直接 `cp .github/workflows/<name> .forgejo/workflows/<name>` —— 会把 ghcr.io / actions/* / attestations 带进内网，runner 跑不通。
- ❌ 只改 registry 地址不改 artifact 下载方式 —— `pattern` + `merge-multiple` 在 forgejo/download-artifact 上会报错。
- ❌ 保留 `actions/github-script` step —— Forgejo 没有这个 action，job 会直接 fail。
- ❌ 把内网代理变量写死成真实代理 URL —— 必须用 `vars.AB_*` 仓库变量，URL 会变。
- ❌ 为了"对齐"而给 Forgejo 版加回阿里云 / Docker Hub 登录 —— 内网没有这些凭据，也没必要。
- ❌ 改了 GitHub 侧却忘了同步 Forgejo 侧（最常见错误）—— 改 `.github/workflows/` 时必须同时检查 `.forgejo/workflows/`。
- ❌ 删掉业务逻辑步骤以求"简化" —— 转换只改执行环境，不改构建/测试内容。
- ❌ 对 `preview-*` / `build-docs` / `helm-release` 等 GitHub 专属 workflow 也强行造 Forgejo 版本 —— 它们依赖 GitHub Pages / Vercel / Helm repo，内网无对应能力。
