/**
 * FastGPT Chat Client (Simple Version - Chat Only)
 *
 * 封装 FastGPT /api/v1/chat/completions 接口的基础调用逻辑。
 * 支持：普通对话、多轮对话。
 *
 * 限制：此版本不支持文件和图片上传（仅用于 Assistant 类型应用）
 * 原因：
 *   - Assistant 应用是轻量级应用，专注于纯文本对话
 *   - 文件上传功能只在 Workflow 或其他应用类型中支持
 *   - 如需文件上传功能，请使用 chat.js 版本（完整版本）
 *
 * 用法：
 *   const { chat } = require('./chat-assistant');
 *
 *   // 普通对话（返回 { reply, chatId }）
 *   const { reply } = await chat({ message: '你好' });
 *
 *   // 多轮对话：用第一次返回的 chatId 继续对话
 *   const first  = await chat({ message: '第一个问题' });
 *   const second = await chat({ message: '继续上面的话题', chatId: first.chatId });
 */

'use strict';

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Allow self-signed certificates
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ─── chatId 生成（与 FastGPT 服务端 getNanoid(24) 保持一致）────────────────
// 首位强制小写字母，其余 23 位为 a-zA-Z0-9，总长 24
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

function getNanoid(size = 16) {
  const first = LOWER[Math.floor(Math.random() * LOWER.length)];
  if (size === 1) return first;
  let rest = '';
  for (let i = 0; i < size - 1; i++) {
    rest += ALNUM[Math.floor(Math.random() * ALNUM.length)];
  }
  return first + rest;
}
// ────────────────────────────────────────────────────────────────────────────

// ─── Configuration — loaded from config.json in the same directory ───────────
const _cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
const BASE_URL = _cfg.baseUrl;
const API_KEY  = _cfg.apiKey;
const APP_ID   = _cfg.appId;
// ────────────────────────────────────────────────────────────────────────────

/**
 * HTTP error codes
 *   400  Bad request (missing required fields such as messages)
 *   401  Invalid or deleted API Key — regenerate in the FastGPT console
 *   403  Forbidden — API Key is not bound to this application
 *   404  Application not found — check APP_ID
 *   429  Too many requests — retry later
 *   500  FastGPT internal server error
 */

/**
 * Send a chat request
 *
 * 此函数仅支持纯文本对话，适用于 Assistant 类型应用。
 *
 * @param {object}  options
 * @param {string}  options.message     User message text (required)
 * @param {string}  [options.chatId]    Session ID; auto-generated if omitted. Pass the chatId returned by a previous call to continue a multi-turn conversation.
 * @param {object}  [options.variables] Application variables (if the app defines custom variables)
 * @returns {Promise<{ reply: string, chatId: string }>}
 *   reply  — AI response text
 *   chatId — Session ID used for this call (pass it back for multi-turn conversations)
 *
 * 不支持的功能：
 *   - imageUrl：图片 URL（如需此功能，使用 chat.js 版本）
 *   - fileUrl：文件 URL（如需此功能，使用 chat.js 版本）
 *   - fileName：文件名（如需此功能，使用 chat.js 版本）
 */
async function chat({ message, chatId, variables } = {}) {
  if (!message) throw new Error('message is required');

  // Auto-generate chatId when not provided, using the same algorithm as the FastGPT server (getNanoid(24))
  const resolvedChatId = chatId || getNanoid(24);

  // Build request body for text-only conversation (Assistant application type)
  // Note: This version only supports plain text messages, no multimodal content
  const body = {
    chatId: resolvedChatId,
    stream: false,
    messages: [{ role: 'user', content: message }]
  };

  if (variables) body.variables = variables;

  let response;
  try {
    // Request fields explanation:
    //   - chatId: Session ID from above (auto-generated or provided)
    //   - stream: false (this client doesn't support streaming)
    //   - messages: Array with single user message
    //     - role: 'user' (message sender role)
    //     - content: plain text message (string, not array like in chat.js)
    //   - variables: Optional application-specific variables
    response = await axios.post(`${BASE_URL}/api/v1/chat/completions`, body, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000,
      httpsAgent
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    const hints = {
      401: 'Invalid or expired API Key — regenerate it in the FastGPT console',
      403: 'Forbidden — confirm the API Key is bound to this application',
      404: 'Application not found — check APP_ID',
      429: 'Too many requests — please retry later',
      500: 'FastGPT internal server error — check whether the service is running'
    };
    const hint = hints[status] ? `\nHint: ${hints[status]}` : '';
    throw new Error(`HTTP ${status ?? 'network error'}: ${detail}${hint}`);
  }

  const choice = response.data?.choices?.[0];
  if (!choice) throw new Error('Unexpected response format: missing choices field');

  return { reply: choice.message?.content ?? '', chatId: resolvedChatId };
}

module.exports = { chat };
