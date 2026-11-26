import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Response,
  type TestInfo
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { buildWorkflowGraph } from './workflow.browser';
import type { WorkflowReferenceSnapshot } from '../../../../../packages/global/core/workflow/type/io';

export type WorkflowGraph = ReturnType<typeof buildWorkflowGraph> & {
  referenceSnapshots?: WorkflowReferenceSnapshot[];
};
type AppGraph = Omit<WorkflowGraph, 'type'> & { type: 'advanced' | 'simple' };
export type AppDetail = AppGraph & {
  _id: string;
  teamId: string;
  tmbId: string;
  publishedVersionId?: string;
};

export const webHeaders = { 'fastgpt-web-request': '1' };
export const publishPath = '/api/core/app/version/publish';
export const editorUrl = (appId: string) => '/app/detail?appId=' + appId;
export const isSave = (url: URL, appId: string) =>
  url.pathname === publishPath && url.searchParams.get('appId') === appId;
export const graphSafe = buildWorkflowGraph(['Start', 'A'], [['Start', 'A']]);

export async function responseData<T>(response: APIResponse | Response): Promise<T> {
  const body = await response.json();
  expect({ http: response.status(), code: body.code }, body.message).toEqual({
    http: 200,
    code: 200
  });
  return body.data as T;
}

export async function attachJson({
  testInfo,
  name,
  data
}: {
  testInfo: TestInfo;
  name: string;
  data: unknown;
}) {
  await testInfo.attach(name, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json'
  });
}

/** 只删除已由当前尝试的创建响应确认的应用 ID。 */
export async function removeTestApp({
  request,
  appId,
  testInfo
}: {
  request: APIRequestContext;
  appId: string;
  testInfo: TestInfo;
}) {
  const removed = await responseData<string[]>(
    await request.delete('/api/core/app/del', { params: { appId }, headers: webHeaders })
  );
  await attachJson({ testInfo, name: 'cleanup', data: { appId, removed } });
  expect(removed).toEqual([appId]);
}

/** 独立应用限定所有写入和清理，服务端受同一个浏览器登录态保护。 */
export const test = base.extend<{ app: AppDetail; graph: AppGraph }>({
  graph: [graphSafe, { option: true }],
  app: async ({ graph, request }, use, testInfo) => {
    const response = await request.post('/api/core/app/create', {
      headers: webHeaders,
      data: { ...graph, name: 'FG-TEST-' + randomUUID() }
    });
    const appId = await responseData<string>(response);
    expect(appId).toMatch(/^[a-f\d]{24}$/);
    try {
      const app = await responseData<AppDetail>(
        await request.get('/api/core/app/detail', {
          params: { appId },
          headers: webHeaders
        })
      );
      await attachJson({
        testInfo,
        name: 'temporary-app',
        data: {
          appId,
          teamId: app.teamId,
          createdAt: new Date().toISOString()
        }
      });
      await use(app);
    } finally {
      await removeTestApp({ request, appId, testInfo });
    }
  }
});

/** 只关闭真实用户会遇到的公告和引导，不提前注入页面状态。 */
export async function openEditor(page: Page, appId: string) {
  page.setDefaultTimeout(15_000);
  await page.addLocatorHandler(
    page.getByRole('dialog').filter({ hasText: '请绑定联系方式' }),
    async (dialog) => {
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    }
  );
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
  await page.goto(editorUrl(appId), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Expand', exact: true })).toBeVisible({
    timeout: 30_000
  });
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
}

export async function chooseSave(page: Page, action: '仅保存' | '保存并发布') {
  await page.getByRole('button', { name: '保存', exact: true }).hover();
  await page.getByText(action, { exact: true }).click();
}

export const waitForSave = ({
  page,
  appId,
  autoSave
}: {
  page: Page;
  appId: string;
  autoSave: boolean;
}) =>
  page.waitForResponse(
    (response) =>
      isSave(new URL(response.url()), appId) &&
      response.request().method() === 'POST' &&
      !!response.request().postDataJSON().autoSave === autoSave
  );
