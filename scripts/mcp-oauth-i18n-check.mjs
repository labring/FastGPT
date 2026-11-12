import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v2.4 MCP OAuth i18n 校验（I5）。
 *
 * 检查项：
 * 1. 全局错误码枚举中的每个 `mcp_oauth_*` 在四种语言都有 `mcpOAuth.error.*` 文案；
 * 2. 四语言 `mcpOAuth.*` 键集合完全一致（缺键/多键都失败）；
 * 3. 前端 oauth 目录不得重新引入 v2.4 已删除的 scope allowlist 概念。
 *
 * 用法：node scripts/mcp-oauth-i18n-check.mjs
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['zh-CN', 'en', 'zh-Hant', 'ko-KR'];
const FRONTEND_OAUTH_DIR = path.join(
  rootDir,
  'projects/app/src/pageComponents/app/detail/Edit/MCPTools/oauth'
);

const fail = (messages) => {
  for (const message of messages) console.error(`FAIL: ${message}`);
  console.log(`missing=${messages.length}`);
  process.exit(1);
};

// 1. 从全局契约读取错误码，避免前端脚本维护第二份清单。
const oauthContractPath = path.join(
  rootDir,
  'packages/global/core/app/tool/mcpTool/oauth.ts'
);
const contractSource = fs.readFileSync(oauthContractPath, 'utf8');
const enumBody = contractSource.match(/McpOAuthErrorCodeEnum = \{([\s\S]*?)\} as const/)?.[1];
if (!enumBody) {
  fail(['could not locate McpOAuthErrorCodeEnum in packages/global/core/app/tool/mcpTool/oauth.ts']);
}
const errorCodes = [...enumBody.matchAll(/:\s*'(mcp_oauth_[^']+)'/g)].map((m) => m[1]);

// 2. 读取四种语言的 common.json。
const locales = Object.fromEntries(
  LANGS.map((lang) => {
    const filePath = path.join(rootDir, 'packages/web/i18n', lang, 'common.json');
    return [lang, JSON.parse(fs.readFileSync(filePath, 'utf8'))];
  })
);

const missing = [];
const mcpKeysByLang = {};
for (const lang of LANGS) {
  const resource = locales[lang];
  const mcpKeys = new Set(
    Object.keys(resource).filter((key) => key.startsWith('mcpOAuth.'))
  );
  mcpKeysByLang[lang] = mcpKeys;

  for (const code of errorCodes) {
    const key = `mcpOAuth.error.${code}`;
    if (!mcpKeys.has(key)) missing.push(`${lang}: missing ${key}`);
    else if (typeof resource[key] !== 'string' || resource[key].trim() === '') {
      missing.push(`${lang}: empty ${key}`);
    }
  }
  if (!mcpKeys.has('mcpOAuth.errorSuggestion.unknown')) {
    missing.push(`${lang}: missing mcpOAuth.errorSuggestion.unknown`);
  }
}

// 3. 四语言键集合必须一致。
const referenceLang = LANGS[0];
const referenceKeys = mcpKeysByLang[referenceLang];
for (const lang of LANGS.slice(1)) {
  const keys = mcpKeysByLang[lang];
  for (const key of referenceKeys) {
    if (!keys.has(key)) missing.push(`${lang}: missing ${key} (present in ${referenceLang})`);
  }
  for (const key of keys) {
    if (!referenceKeys.has(key)) missing.push(`${lang}: extra ${key} (absent in ${referenceLang})`);
  }
}

// 4. 前端禁止恢复 allowlist 概念（v2.4 删除项）。
const forbiddenPatterns = [
  'scopeAllowlist',
  'scope_allowlist',
  'MCP_OAUTH_SCOPE_NOT_CONFIGURED',
  'mcp_oauth_scope_not_allowed',
  'mcp_oauth_scope_not_configured',
  'mcp_oauth_scope_escalation'
];
if (fs.existsSync(FRONTEND_OAUTH_DIR)) {
  for (const fileName of fs.readdirSync(FRONTEND_OAUTH_DIR)) {
    if (!/\.(ts|tsx)$/.test(fileName)) continue;
    const source = fs.readFileSync(path.join(FRONTEND_OAUTH_DIR, fileName), 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (source.includes(pattern)) {
        missing.push(`${fileName}: forbidden allowlist token ${pattern}`);
      }
    }
  }
}

if (missing.length > 0) fail(missing);

console.log(`languages=${LANGS.join(',')}`);
console.log(`errorCodes=${errorCodes.length}`);
console.log(`mcpOAuthKeys=${referenceKeys.size}`);
console.log('missing=0');
