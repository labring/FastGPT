---
name: fastgpt-cli-setup
description: Install FastGPT CLI, guide the user through service selection and login, verify their identity, and summarize available capabilities.
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

先运行 `fastgpt whoami --format json`。已有有效登录且服务符合用户要求时直接复用，否则引导用户登录。

服务尚未明确时，向用户提供两个云服务选项：

| 服务               | Base URL                   |
| ------------------ | -------------------------- |
| FastGPT 中国大陆云 | `https://cloud.fastgpt.cn` |
| FastGPT 国际云     | `https://cloud.fastgpt.io` |

其他版本或自建部署需要用户输入 Base URL；用户已提供地址时直接使用。

根据用户选择的认证方式执行 `fastgpt login --base-url <baseURL>`，所需认证参数按 `fastgpt login --help` 获取。凭据由用户提供或通过 CLI 交互输入，不回显密码或密钥。

登录后运行 `fastgpt whoami --format json` 验证，并读取实际服务地址、用户和团队信息；缺失的信息如实说明。

## 3. 获取能力并汇报

```bash
fastgpt doctor --format json
fastgpt commands --format json
```

最后仅汇总一次：CLI 版本、服务地址、当前用户与团队、验证结果，以及当前 CLI 能做哪些事。能力介绍以命令元数据和当前凭据的能力信息为准，简要归纳即可，不逐项复述参数或输出完整用法。存在失败项时说明问题，不宣称初始化全部完成。
