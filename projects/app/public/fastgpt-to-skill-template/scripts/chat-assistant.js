/**
 * FastGPT Chat Client (Simple Version - Chat Only)
 *
 * 封装 FastGPT /api/v1/chat/completions 接口的基础调用逻辑。
 * 支持：普通对话、多轮对话。
 * 注意：此版本不支持文件和图片上传（仅用于 Assistant 类型应用）。
 *
 * 用法：
 *   const { chat } = require('./chat');
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
const fs = require('fs');
const path = require('path');

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
 * @param {object}  options
 * @param {string}  options.message     User message text (required)
 * @param {string}  [options.chatId]    Session ID; auto-generated if omitted. Pass the chatId returned by a previous call to continue a multi-turn conversation.
 * @param {object}  [options.variables] Application variables (if the app defines custom variables)
 * @returns {Promise<{ reply: string, chatId: string }>}
 *   reply  — AI response text
 *   chatId — Session ID used for this call (pass it back for multi-turn conversations)
 */
async function chat({ message, chatId, variables } = {}) {
  if (!message) throw new Error('message is required');

  // Auto-generate chatId when not provided, using the same algorithm as the FastGPT server (getNanoid(24))
  const resolvedChatId = chatId || getNanoid(24);

  const body = {
    chatId: resolvedChatId,
    stream: false,
    messages: [{ role: 'user', content: message }]
  };

  if (variables) body.variables = variables;

  let response;
  try {
    response = await axios.post(`${BASE_URL}/api/v1/chat/completions`, body, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
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
