---
name: {skillName}
description: |
{skillDescription}
---

# {skillName}

调用 FastGPT 平台的"{appName}"应用进行智能对话。

## 简介

{appIntro}

## 配置信息

凭证已写入 `scripts/config.json`，如需修改请直接编辑该文件：

```json
{
  "baseUrl": "{baseUrl}",
  "apiKey": "{apiKey}",
  "appId": "{appId}"
}
```

| 参数 | 值 |
|------|----|
| **Key 名称** | {keyName} |
| **有效期** | {expiredTime} |
| **应用类型** | {appType} |
| **导出时间** | {exportTime} |

⚠️ **安全提示**：请妥善保管 `scripts/config.json`，不要提交到版本控制。如需撤销，请在 FastGPT 控制台删除此 Key。

## 环境准备

**1. 验证 Node.js 是否已安装**

```bash
node -v
```

若提示命令不存在，请前往 [https://nodejs.org/](https://nodejs.org/) 安装 LTS 版本。

**2. 检查并安装依赖**

本 Skill 需要 `axios` 依赖才能运行。请先检查环境中是否已有：

```bash
node -e "require('axios'); console.log('axios 已安装')"
```

- 若显示 `axios 已安装`，说明环境中已有此依赖，**无需再次安装**
- 若提示 `Cannot find module 'axios'`，请在 Skill 目录下执行：

```bash
npm install
```

⚠️ **重要提示**：如果你的 Claude Code 或 Node.js 环境中已经全局安装了 axios，请勿重复安装，以免破坏现有环境

## 使用方法

所有调用均通过 `scripts/chat.js` 完成，无需直接操作 HTTP 接口。

> `chat()` 返回 `{ reply, chatId }`：
> - `reply` — AI 回复文本
> - `chatId` — 本次对话的会话 ID，**多轮对话和文件上传都需要传入此值**

### 基础对话

```javascript
const { chat } = require('./scripts/chat');

const { reply } = await chat({ message: '你好，请介绍一下自己' });
console.log(reply);
```

### 多轮对话

用上一次返回的 `chatId` 发起下一轮，服务端会自动关联历史记录：

```javascript
const { chat } = require('./scripts/chat');

const first  = await chat({ message: '第一个问题' });
const second = await chat({ message: '接着上面继续说', chatId: first.chatId });
console.log(second.reply);
```

{fileUploadUsage}

{variablesUsage}

## 响应说明

成功时 `chat()` 返回 AI 回复的文本字符串。

常见错误码：

| 状态码 | 原因 | 处理建议 |
|--------|------|----------|
| 401 | API Key 无效或已删除 | 在 FastGPT 控制台重新生成 Key |
| 403 | Key 未绑定此应用 | 确认 Key 与 App ID 匹配 |
| 404 | 应用不存在 | 检查 App ID 是否正确 |
| 429 | 请求过于频繁 | 稍后重试 |
| 500 | 服务内部错误 | 检查 FastGPT 服务是否正常运行 |

## 注意事项

1. API Key 仅限访问本应用，无法调用其他应用或全局接口
2. 多轮对话需在上传文件和对话时使用同一 `chatId`
3. 生产环境请使用 HTTPS 确保传输安全
4. 如需修改应用配置，请在 FastGPT 控制台操作

## 技术支持

- FastGPT 文档：https://doc.fastgpt.in/
- API 文档：https://doc.fastgpt.in/docs/development/openapi/

---
*本 Skill 由 FastGPT 自动生成于 {exportTime}*
