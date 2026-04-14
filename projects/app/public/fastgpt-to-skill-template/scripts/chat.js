/**
 * FastGPT Chat Client
 *
 * 封装 FastGPT /api/v1/chat/completions 接口的完整调用逻辑。
 * 支持：普通对话、多轮对话、带图片/文件的多模态对话。
 *
 * 用法：
 *   const { chat, uploadFile } = require('./chat');
 *
 *   // 普通对话（返回 { reply, chatId }）
 *   const { reply } = await chat({ message: '你好' });
 *
 *   // 多轮对话：用第一次返回的 chatId 继续对话
 *   const first  = await chat({ message: '第一个问题' });
 *   const second = await chat({ message: '继续上面的话题', chatId: first.chatId });
 *
 *   // 带图片（在线 URL）
 *   const { reply } = await chat({ message: '分析图片', imageUrl: 'https://...' });
 *
 *   // 带本地文件：先从 chat() 拿到 chatId，再上传文件，最后发起对话
 *   const { chatId } = await chat({ message: '你好' });
 *   const fileUrl   = await uploadFile('/path/to/doc.pdf', chatId);
 *   const { reply } = await chat({ message: '分析文件', fileUrl, fileName: 'doc.pdf', chatId });
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
 * @param {object}  options
 * @param {string}  options.message     User message text (required)
 * @param {string}  [options.chatId]    Session ID; auto-generated if omitted. Pass the chatId returned by a previous call to continue a multi-turn conversation.
 * @param {string}  [options.imageUrl]  Image URL (must be publicly accessible)
 * @param {string}  [options.fileUrl]   URL of an already-uploaded file
 * @param {string}  [options.fileName]  File name (used together with fileUrl)
 * @param {object}  [options.variables] Application variables (if the app defines custom variables)
 * @returns {Promise<{ reply: string, chatId: string }>}
 *   reply  — AI response text
 *   chatId — Session ID used for this call (pass it back for multi-turn conversations or file uploads)
 */
async function chat({ message, chatId, imageUrl, fileUrl, fileName, variables } = {}) {
  if (!message) throw new Error('message is required');

  // Auto-generate chatId when not provided, using the same algorithm as the FastGPT server (getNanoid(24))
  const resolvedChatId = chatId || getNanoid(24);

  // Build content: plain string for text-only, array for multimodal
  let content;
  if (imageUrl || fileUrl) {
    content = [{ type: 'text', text: message }];
    if (imageUrl) {
      content.push({ type: 'image_url', image_url: { url: imageUrl } });
    }
    if (fileUrl) {
      content.push({ type: 'file_url', name: fileName || path.basename(fileUrl), url: fileUrl });
    }
  } else {
    content = message;
  }

  const body = {
    chatId: resolvedChatId,
    stream: false,
    messages: [{ role: 'user', content }]
  };

  if (variables) body.variables = variables;

  let response;
  try {
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

/**
 * Upload a local file to FastGPT and return the accessible file URL
 *
 * Steps:
 *   1. Call presignChatFilePostUrl to obtain a pre-signed upload URL
 *   2. PUT the file to the pre-signed URL
 *   3. Return the file access URL
 *
 * @param {string} filePath  Absolute path to the local file
 * @param {string} chatId    Session ID (must match the chatId used in the subsequent chat() call)
 * @returns {Promise<string>} File access URL
 */
async function uploadFile(filePath, chatId) {
  if (!filePath) throw new Error('filePath is required');
  if (!chatId)   throw new Error('chatId is required');
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  // Step 1: Obtain pre-signed upload URL
  let presignRes;
  try {
    presignRes = await axios.post(
      `${BASE_URL}/api/core/chat/file/presignChatFilePostUrl`,
      { filename, appId: APP_ID, chatId },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000,
        httpsAgent
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Failed to obtain upload URL — HTTP ${status ?? 'network error'}: ${detail}`);
  }

  const { url: uploadUrl, headers: uploadHeaders } = presignRes.data?.data ?? {};
  if (!uploadUrl) throw new Error('Failed to obtain pre-signed upload URL: missing url field in response');

  // Step 2: Upload the file
  try {
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        ...uploadHeaders,
        'Content-Length': fileBuffer.length
      },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      httpsAgent
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`File upload failed — HTTP ${status ?? 'network error'}: ${detail}`);
  }

  // Step 3: Build and return the file access URL from the key field
  const key = presignRes.data?.data?.key;
  if (!key) throw new Error('File uploaded successfully, but the response is missing the key field; cannot construct file URL');

  return `${BASE_URL}/${key.replace(/^\//, '')}`;
}

module.exports = { chat, uploadFile };
