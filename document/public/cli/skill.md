---
name: fastgpt-cli-setup
description: Install FastGPT CLI, sign in on the user's behalf with their credentials and chosen service, verify their identity, and summarize available capabilities.
---

# FastGPT CLI 初始化引导

帮助用户完成安装、登录验证和身份确认，最后介绍当前 CLI 的能力。具体命令用法按需查看 `--help`。

## 1. 安装

检查 Node.js 版本是否满足 `>= 20.12.0`。已有 CLI 可直接复用；未安装或需要升级时执行：

```bash
npm install -g @fastgpt/cli@beta
fastgpt --version
```

也可使用 `pnpm add -g @fastgpt/cli@beta` 安装。

## 2. 登录并确认身份

先运行 `fastgpt whoami --format json`。已有有效登录且服务符合用户要求时直接复用，否则由 AI 代执行登录，不默认要求用户自行在终端操作。缺少信息时，一次询问账号、密码和目标服务；用户已提供的信息不重复询问。

服务尚未明确时，向用户提供两个云服务选项：

| 服务               | Base URL                   |
| ------------------ | -------------------------- |
| FastGPT 中国大陆云 | `https://cloud.fastgpt.cn` |
| FastGPT 国际云     | `https://cloud.fastgpt.io` |

其他版本或自建部署需要用户输入 Base URL；用户已提供地址时直接使用。Base URL 是 FastGPT 实例地址，不是本 Skill 所在的文档站点地址。

使用用户提供的账号和密码，由 AI 执行：

```bash
fastgpt login --base-url <baseURL> --username <username> --password-stdin --format json
```

通过子进程标准输入发送密码，不将密码拼入 shell 命令或回显。用户已提供 API Key 或 Session Token 时，按 `fastgpt login --help` 使用对应的标准输入参数代执行登录。

遇到验证码或二次验证时，由 AI 控制交互终端继续执行，仅请用户补充必要的验证码；交互模式不加 `--format json`。当前环境无法继续时，说明具体阻碍。

登录后运行 `fastgpt whoami --format json` 验证，并读取实际服务地址、用户和团队信息；缺失的信息如实说明。

## 3. 获取能力并汇报

```bash
fastgpt doctor --format json
fastgpt commands --format json
```

最后仅汇总一次：CLI 版本、服务地址、当前用户与团队、验证结果，以及当前 CLI 能做哪些事。能力介绍以命令元数据和当前凭据的能力信息为准，简要归纳即可，不逐项复述参数或输出完整用法。存在失败项时说明问题，不宣称初始化全部完成。
