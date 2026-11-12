import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { McpToolSetNode } from '../../../../packages/global/core/workflow/template/system/mcpToolSet';
import { WorkflowStart } from '../../../../packages/global/core/workflow/template/system/workflowStart';

/**
 * Stage I5c：MCP OAuth v2.4 浏览器 UI 端到端。
 *
 * 真实链路（无 mock）：
 *   编辑页保存 oauth 配置 → 去授权 → fixture HTML 同意页点击「授权」
 *   → FastGPT callback → 回调自动 getTools 并落库 → 状态卡 authorized（clientSource=cimd）
 *   → 断开（二次确认，fixture revocations+1）→ 重新授权（复用 CIMD client，registrations=0）
 *   → expire-tokens 后点「解析」→ refresh 换新 Bearer（fixture refreshes+1、新指纹）。
 *
 * 另一条用例验证设计 §9.1：工作流内联 NodeToolSet 没有任何 OAuth 入口
 * （源码静态断言 + 真实工作流编辑页 UI 断言）。
 *
 * 前置（runUiE2EV24.sh 统一准备）：
 *   FASTGPT_TEST_BASE_URL / FASTGPT_TEST_STORAGE_STATE / FASTGPT_TEST_IGNORE_HTTPS=1
 *   FASTGPT_TEST_CHROMIUM_PATH=/usr/bin/chromium
 *   MCP_FIXTURE_BASE_URL（默认 http://127.0.0.1:18110）
 *
 * 安全：不输出/落盘任何明文 token、secret、session cookie；只记录 sha256 指纹与计数。
 */

const FIXTURE = (process.env.MCP_FIXTURE_BASE_URL || 'http://127.0.0.1:18110').replace(
  /\/+$/,
  ''
);
const MCP_URL = `${FIXTURE}/mcp`;
const SHOTS_DIR =
  process.env.FASTGPT_UI_SHOTS_DIR || path.resolve(process.cwd(), '../../plans/e2e-ui-v24/shots');
const EVIDENCE_DIR =
  process.env.FASTGPT_UI_EVIDENCE_DIR ||
  path.resolve(process.cwd(), '../../plans/e2e-ui-v24/evidence');
const REDIS_CONTAINER = process.env.FASTGPT_UI_REDIS_CONTAINER || 'fastgpt-redis';

let appId = '';
let inlineAppId = '';
const navigatedUrls: string[] = [];
const statsTimeline: Record<string, unknown> = {};
const shots: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fixtureJson = async (
  request: APIRequestContext,
  method: 'GET' | 'POST',
  pathname: string,
  data?: unknown
) => {
  const response = await request.fetch(`${FIXTURE}${pathname}`, {
    method,
    ...(data === undefined ? {} : { data })
  });
  expect(response.ok(), `${method} ${pathname} -> ${response.status()}`).toBeTruthy();
  return await response.json();
};

const waitForFixture = async (
  request: APIRequestContext,
  pathname: string,
  predicate: (body: any) => boolean,
  label: string,
  timeoutMs = 90_000
) => {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await (await request.get(`${FIXTURE}${pathname}`)).json();
    if (predicate(last)) return last;
    await sleep(400);
  }
  throw new Error(
    `等待 fixture 条件超时（${label}）: ${JSON.stringify({
      total: last?.total,
      refreshes: last?.refreshes,
      revocations: last?.revocations,
      registrations: last?.registrations,
      tokenRequestsByGrant: last?.tokenRequestsByGrant
    })}`
  );
};

/** 仅测试隔离：清理上一轮 OAuth 限流计数，不放宽任何生产阈值。 */
const clearOAuthRateLimits = () => {
  try {
    const keys = execFileSync(
      'sudo',
      [
        '-n',
        'docker',
        'exec',
        REDIS_CONTAINER,
        'redis-cli',
        '--scan',
        '--pattern',
        'fastgpt:rate-limit:mcp-oauth:*'
      ],
      { encoding: 'utf8', timeout: 20_000 }
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (keys.length > 0) {
      execFileSync(
        'sudo',
        ['-n', 'docker', 'exec', REDIS_CONTAINER, 'redis-cli', 'DEL', ...keys],
        { encoding: 'utf8', timeout: 20_000 }
      );
    }
  } catch {
    // 限流清理失败不阻断用例；真实限流命中时会在日志中显式报错。
  }
};

const shot = async (page: Page, name: string) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, name);
  await page.screenshot({ path: file, fullPage: true });
  shots.push(file);
};

/** 证据中的 URL 只保留结构：授权码/state/PKCE/token 一律脱敏。 */
const redactUrl = (value: string) => {
  try {
    const url = new URL(value);
    for (const key of ['code', 'state', 'code_verifier', 'access_token', 'refresh_token']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '<redacted>');
    }
    return url.toString();
  } catch {
    return '<unparsable-url>';
  }
};

/** 状态卡字段：Field = label div + value div。 */
const fieldValue = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).first().locator('xpath=following-sibling::div[1]');

const closeBootDialogs = async (page: Page) => {
  await page.addLocatorHandler(
    page.getByRole('dialog', { name: '系统消息', exact: true }),
    async (dialog) => {
      await dialog.getByRole('button', { name: '已读', exact: true }).click();
    }
  );
  await page.addLocatorHandler(
    page.getByRole('dialog').filter({ hasText: '系统配置移到这里啦~' }),
    async (dialog) => {
      await dialog.getByRole('button', { name: '知道了', exact: true }).click();
    }
  );
};

/** 进入 fixture 同意页并点击「授权」，等待回跳后的成功 toast。 */
const approveConsent = async (page: Page, label: string) => {
  await expect(page).toHaveURL(
    new RegExp(`^${FIXTURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/authorize`),
    { timeout: 60_000 }
  );
  await expect(page.getByRole('heading', { name: '授权请求', exact: true })).toBeVisible();
  await expect(page.getByText(MCP_URL, { exact: false }).first()).toBeVisible();
  await expect(page.getByText('mcp:tools', { exact: true }).first()).toBeVisible();
  await shot(page, `${label}-consent.png`);

  await page.getByRole('button', { name: '授权', exact: true }).click();
  await expect(page.getByText('授权成功，已自动获取工具列表', { exact: true })).toBeVisible({
    timeout: 90_000
  });
  await shot(page, `${label}-callback-toast.png`);
};

const gotoAppDetail = async (page: Page, id: string) => {
  await page.goto(`/app/detail?appId=${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('MCP 地址', { exact: true })).toBeVisible({ timeout: 120_000 });
};

/**
 * Next dev 的 HMR WebSocket 在自签 HTTPS + 非 localhost Host 下无法升级，
 * dev client 会周期性整页 reload（本环境实测约 40-70s），真实 UI 交互会被导航打断。
 * 仅测试进程内拦截 HMR socket（不改应用代码），保持页面稳定。
 */
const stabilizeNextDev = async (page: Page) => {
  await page.routeWebSocket(/\/_next\/hmr(?:\?|$)/, (ws) => {
    ws.onMessage(() => undefined);
  });
};

/** 点击后等待跳转；偶发整页刷新导致点击丢失时重试（仅测试侧容错）。 */
const clickAndWaitForNavigation = async (
  page: Page,
  button: Locator,
  label: string,
  target: RegExp,
  timeoutMs = 120_000
) => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await button.click({ timeout: 15_000 });
    } catch (error) {
      lastError = error;
    }
    try {
      await page.waitForURL(target, { timeout: 20_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
      await sleep(500);
    }
  }
  throw new Error(`点击「${label}」后未跳转到 ${target}: ${String(lastError)}`);
};

test.describe.configure({ timeout: 600_000, mode: 'serial' });

test.beforeAll(async ({ request }) => {
  clearOAuthRateLimits();
  // fixture：重置计数 + 强制真实 HTML 同意页。
  await fixtureJson(request, 'POST', '/debug/reset');
  await fixtureJson(request, 'POST', '/debug/inject', { consent: 'always' });

  // 独立工具集：authMode=oauth + 空 toolList（设计 §8 create 契约）。
  const response = await request.post('/api/core/app/mcpTools/create', {
    headers: { 'fastgpt-web-request': '1' },
    data: {
      name: `MCP OAuth UI E2E ${randomUUID().slice(0, 8)}`,
      url: MCP_URL,
      authMode: 'oauth',
      clientMode: 'auto',
      // 预置 scope 仅作为容错基线；用例仍会在 UI 内填写并保存 scope。
      scope: 'mcp:tools',
      toolList: []
    }
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(body.code).toBe(200);
  expect(typeof body.data).toBe('string');
  expect(body.data).toMatch(/^[a-f0-9]{24}$/);
  appId = body.data;
  statsTimeline.appId = appId;
});

test.afterAll(async ({ request }) => {
  for (const id of [appId, inlineAppId]) {
    if (!id) continue;
    await request
      .delete(`/api/core/app/del?appId=${id}`, {
        headers: { 'fastgpt-web-request': '1' }
      })
      .catch(() => undefined);
  }
  await request
    .fetch(`${FIXTURE}/debug/inject`, { method: 'POST', data: { consent: 'auto' } })
    .catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
  // 首次访问 Next dev 需要编译整页；导航超时放宽，业务断言仍用各自超时。
  page.setDefaultNavigationTimeout(180_000);
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigatedUrls.push(frame.url());
  });
  await stabilizeNextDev(page);
  await closeBootDialogs(page);
});

test('MCP OAuth v2.4 UI：保存 → 去授权 → 自动 getTools → 断开 → 重授权 → refresh', async ({
  page,
  request
}) => {
  await gotoAppDetail(page, appId);

  /* ---------- 1. 初始配置：oauth 空工具集 ---------- */
  const urlInput = page.getByPlaceholder('填入 MCP 地址后，点击解析');
  await expect(urlInput).toHaveValue(MCP_URL);
  await expect(page.getByText('鉴权方式', { exact: true })).toBeVisible();
  await expect(page.getByText('工具列表: 0', { exact: true })).toBeVisible();
  await shot(page, '01-mcp-tools-initial.png');

  /* ---------- 2. 切 OAuth / auto / scope=mcp:tools 并保存 ---------- */
  await page.getByText('OAuth', { exact: true }).first().click();
  await expect(page.getByText('客户端模式', { exact: true })).toBeVisible();
  await expect(page.getByText('自动（推荐）', { exact: true })).toBeVisible();
  await expect(page.getByText('CIMD', { exact: true }).first()).toBeVisible();

  await urlInput.fill(MCP_URL);
  await page
    .getByPlaceholder('留空表示不申请额外权限，多个 scope 用空格分隔')
    .fill('mcp:tools');

  await page.getByRole('button', { name: '保存', exact: true }).first().click();
  await expect(page.getByText('更新成功', { exact: true })).toBeVisible({ timeout: 30_000 });

  await expect(fieldValue(page, '可发起授权')).toHaveText('是', { timeout: 30_000 });
  await expect(page.getByText('授权状态', { exact: true })).toBeVisible();
  await shot(page, '02-oauth-config-saved.png');

  /* ---------- 3. 去授权 → 真实同意页 → 授权 ---------- */
  const statsBeforeFirstAuth = await fixtureJson(request, 'GET', '/debug/stats');
  // v2.4 中首次未授权（state=reauth_required）时按钮文案为「重新授权」，
  // 仅部分状态（如 client_missing）显示「去授权」；两种入口都算真实授权入口。
  await clickAndWaitForNavigation(
    page,
    page.getByRole('button', { name: /^(去授权|重新授权)$/ }),
    '去授权/重新授权',
    /\/authorize/
  );
  await approveConsent(page, '03');

  /* ---------- 4. 回调成功：toast + 状态卡 + 自动 getTools ---------- */
  expect(navigatedUrls.some((url) => /[?&]oauth=success(&|$)/.test(url))).toBe(true);
  await expect(fieldValue(page, '状态')).toHaveText('已授权', { timeout: 60_000 });
  await expect(fieldValue(page, '客户端来源')).toHaveText('CIMD');
  await expect(fieldValue(page, '已授予 scope')).toHaveText('mcp:tools');
  await expect(fieldValue(page, '可断开')).toHaveText('是');

  // 回调后无需手动解析：工具列表应自动出现（设计 §9.2）。
  await expect(page.getByText('工具列表: 2', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('whoami', { exact: true })).toBeVisible();
  await expect(page.getByText('echo', { exact: true })).toBeVisible();
  const fingerprintAfterCallback = await waitForFixture(
    request,
    '/debug/bearer-fingerprints',
    (body) => body.total >= 1,
    '回调自动 getTools 携带 Bearer'
  );
  const statsAfterFirstAuth = await fixtureJson(request, 'GET', '/debug/stats');
  expect(statsAfterFirstAuth.registrations).toBe(0);
  expect(statsAfterFirstAuth.authorizations).toBeGreaterThan(
    statsBeforeFirstAuth.authorizations
  );
  statsTimeline.firstAuth = {
    authorizationsBefore: statsBeforeFirstAuth.authorizations,
    authorizationsAfter: statsAfterFirstAuth.authorizations,
    registrations: statsAfterFirstAuth.registrations,
    fingerprints: fingerprintAfterCallback.total,
    clientSource: 'cimd'
  };
  await shot(page, '04-authorized-auto-tools.png');

  /* ---------- 5. 断开授权（二次确认） ---------- */
  const statsBeforeDisconnect = await fixtureJson(request, 'GET', '/debug/stats');
  await page.getByRole('button', { name: '断开', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: '断开 OAuth 授权？' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(
    dialog.getByText('断开后将清除本地令牌并尽力撤销授权', { exact: false })
  ).toBeVisible();
  await shot(page, '05-disconnect-confirm.png');
  await dialog.getByRole('button', { name: '断开', exact: true }).click();
  await expect(page.getByText('已断开授权', { exact: true })).toBeVisible({ timeout: 30_000 });

  await expect(fieldValue(page, '状态')).toHaveText('需要重新授权', { timeout: 30_000 });
  await expect(fieldValue(page, '可断开')).toHaveText('否');
  const statsAfterDisconnect = await fixtureJson(request, 'GET', '/debug/stats');
  // v2.4 断开时尽力撤销 access token 与 refresh token，fixture 按请求计数（通常 +2）；
  // 断言至少发生一次撤销，并记录真实增量。
  const revocationsDelta =
    statsAfterDisconnect.revocations - statsBeforeDisconnect.revocations;
  expect(revocationsDelta).toBeGreaterThanOrEqual(1);
  statsTimeline.disconnect = {
    revocationsBefore: statsBeforeDisconnect.revocations,
    revocationsAfter: statsAfterDisconnect.revocations,
    delta: revocationsDelta
  };
  await shot(page, '06-disconnected.png');

  /* ---------- 6. 重新授权：CIMD client 复用，registrations=0 ---------- */
  const statsBeforeReauth = await fixtureJson(request, 'GET', '/debug/stats');
  await clickAndWaitForNavigation(
    page,
    page.getByRole('button', { name: '重新授权', exact: true }),
    '重新授权',
    /\/authorize/
  );
  await approveConsent(page, '07-reauth');
  await expect(fieldValue(page, '状态')).toHaveText('已授权', { timeout: 60_000 });
  await expect(fieldValue(page, '客户端来源')).toHaveText('CIMD');
  const statsAfterReauth = await fixtureJson(request, 'GET', '/debug/stats');
  expect(statsAfterReauth.registrations).toBe(0);
  expect(statsAfterReauth.registrations).toBe(statsBeforeReauth.registrations);
  expect(statsAfterReauth.authorizations).toBeGreaterThan(statsBeforeReauth.authorizations);
  statsTimeline.reauth = {
    authorizationsBefore: statsBeforeReauth.authorizations,
    authorizationsAfter: statsAfterReauth.authorizations,
    registrations: statsAfterReauth.registrations,
    clientSource: 'cimd'
  };
  await shot(page, '08-reauthorized.png');

  /* ---------- 7. 强制 access token 过期 → 解析触发 refresh ---------- */
  const statsBeforeRefresh = await fixtureJson(request, 'GET', '/debug/stats');
  const fpBeforeRefresh = await fixtureJson(request, 'GET', '/debug/bearer-fingerprints');
  const expired = await fixtureJson(request, 'POST', '/debug/expire-tokens');
  expect(expired.expired).toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: '解析', exact: true }).click();
  const statsAfterRefresh = await waitForFixture(
    request,
    '/debug/stats',
    (body) =>
      body.refreshes > statsBeforeRefresh.refreshes &&
      body.tokenRequestsByGrant.refresh_token >
        statsBeforeRefresh.tokenRequestsByGrant.refresh_token,
    'refresh token 换新 access token'
  );
  const fpAfterRefresh = await waitForFixture(
    request,
    '/debug/bearer-fingerprints',
    (body) => body.total > fpBeforeRefresh.total,
    '刷新后新的 Bearer 指纹'
  );
  expect(fpAfterRefresh.fingerprints.length).toBeGreaterThan(fpBeforeRefresh.total);
  expect(fpAfterRefresh.expiredFingerprints.length).toBeGreaterThanOrEqual(
    fpBeforeRefresh.expiredFingerprints.length
  );
  await expect(fieldValue(page, '状态')).toHaveText('已授权');
  statsTimeline.refresh = {
    refreshesBefore: statsBeforeRefresh.refreshes,
    refreshesAfter: statsAfterRefresh.refreshes,
    refreshGrantBefore: statsBeforeRefresh.tokenRequestsByGrant.refresh_token,
    refreshGrantAfter: statsAfterRefresh.tokenRequestsByGrant.refresh_token,
    fingerprintsBefore: fpBeforeRefresh.total,
    fingerprintsAfter: fpAfterRefresh.total,
    newFingerprints: fpAfterRefresh.fingerprints.slice(fpBeforeRefresh.total)
  };
  await shot(page, '09-after-token-refresh.png');

  /* ---------- 8. 取证落盘（只含指纹/计数） ---------- */
  const finalStats = await fixtureJson(request, 'GET', '/debug/stats');
  const finalFingerprints = await fixtureJson(request, 'GET', '/debug/bearer-fingerprints');
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePath = path.join(
    EVIDENCE_DIR,
    `ui-e2e-v24-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        stage: 'I5c',
        design: 'docs/design/mcp-oauth-v2.4.md §9',
        generatedAt: new Date().toISOString(),
        baseUrl: process.env.FASTGPT_TEST_BASE_URL,
        fixture: FIXTURE,
        mcpUrl: MCP_URL,
        appId,
        navigatedUrls: [...new Set(navigatedUrls)].map(redactUrl),
        timeline: statsTimeline,
        finalStats,
        finalFingerprints,
        screenshots: shots
      },
      null,
      2
    )
  );
  await test.info().attach('ui-e2e-v24-evidence', {
    path: evidencePath,
    contentType: 'application/json'
  });
});

test('内联工作流 NodeToolSet 不暴露任何 OAuth 入口（静态 + UI）', async ({ page, request }) => {
  /* ---------- 1. 静态源码断言 ---------- */
  const nodeToolSetSource = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet.tsx'
    ),
    'utf8'
  );
  expect(nodeToolSetSource).not.toMatch(/mcpOAuth|McpOAuth|authMode|oauth/i);

  const nodeTypeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'packages/global/core/workflow/type/node.ts'),
    'utf8'
  );
  const inlineSchema = nodeTypeSource.slice(
    nodeTypeSource.indexOf('export const McpToolSetNodeConfigSchema'),
    nodeTypeSource.indexOf('export type McpToolSetNodeConfigType')
  );
  expect(inlineSchema).toContain('.strict()');
  expect(inlineSchema).not.toMatch(/authMode|oauth|clientMode/i);
  statsTimeline.inlineStatic = {
    nodeToolSetHasOAuth: false,
    inlineSchemaStrict: true,
    inlineSchemaHasOAuth: false
  };

  /* ---------- 2. 真实工作流编辑页 UI 断言 ---------- */
  const graph = {
    type: 'advanced',
    name: `Inline MCP OAuth isolation ${randomUUID().slice(0, 8)}`,
    nodes: [
      {
        ...structuredClone(WorkflowStart),
        nodeId: 'Start',
        name: 'Start',
        isFolded: false,
        position: { x: 0, y: 0 }
      },
      {
        ...structuredClone(McpToolSetNode),
        nodeId: 'Mcp',
        name: 'MCP 工具',
        isFolded: false,
        position: { x: 900, y: 0 },
        toolConfig: { mcpToolSet: { url: MCP_URL, toolList: [] } }
      }
    ],
    edges: [],
    chatConfig: {}
  };

  const created = await request.post('/api/core/app/create', {
    headers: { 'fastgpt-web-request': '1' },
    data: graph
  });
  expect(created.status(), await created.text()).toBe(200);
  const createdBody = await created.json();
  expect(createdBody.code).toBe(200);
  inlineAppId = createdBody.data;
  expect(inlineAppId).toMatch(/^[a-f0-9]{24}$/);

  await page.goto(`/app/detail?appId=${inlineAppId}`, { waitUntil: 'domcontentloaded' });
  const node = page.locator('.react-flow__node[data-id="Mcp"]');
  await expect(node).toBeVisible({ timeout: 120_000 });
  await expect(node.getByText('工具列表', { exact: true })).toBeVisible();
  await expect(node.getByText('暂无数据，请先解析 MCP 地址', { exact: true })).toBeVisible();

  // 页面级：不存在 OAuth 相关入口/文案。
  for (const text of ['鉴权方式', '客户端模式', '去授权', '重新授权', '断开']) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }

  // 打开内联 MCP 工具集配置：只有 URL + 请求头（鉴权配置）+ 解析。
  await node.getByRole('button', { name: '配置', exact: true }).click();
  await expect(node.getByPlaceholder('填入 MCP 地址后，点击解析')).toBeVisible();
  await expect(node.getByRole('button', { name: '鉴权配置', exact: true })).toBeVisible();
  await expect(node.getByRole('button', { name: '解析', exact: true })).toBeVisible();
  for (const text of ['鉴权方式', '客户端模式', 'OAuth', '去授权', '断开']) {
    await expect(node.getByText(text, { exact: true })).toHaveCount(0);
  }
  await shot(page, '10-inline-node-no-oauth.png');
});
