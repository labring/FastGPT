import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openAPIPaths } from '../../openapi/path';
import { SystemOpenApiTagMap } from '../../openapi/tag';
import { FastGptSdkMetaSchema } from '../../openapi/type';
import { apiDocOpenAPIDocument, tagGroups } from '../../openapi/provider/systemopenapi';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

type CollectedSystemOperation = {
  routePath: string;
  method: HttpMethod;
  deprecated: boolean;
  sdkMeta: unknown;
  hasSuccessContent: boolean;
};

/**
 * 遵循代码规范：服务端 handler 确实无业务返回数据（返回 undefined）的开放写接口，
 * OpenAPI 只保留 200 状态码与说明，不创建空对象或 undefined 占位 Schema；后续 SDK IR 统一映射为 void。
 */
const VOID_SYSTEM_OPENAPI_OPERATIONS = new Set<string>([
  'POST /core/chat/history/markRead',
  'PUT /core/chat/history/updateHistory',
  'DELETE /core/chat/history/delHistory',
  'DELETE /core/chat/history/clearHistories',
  'POST /core/chat/history/batchDelete',
  'DELETE /core/chat/record/delete',
  'POST /core/dataset/collection/delete',
  'POST /core/dataset/collection/update',
  'DELETE /core/dataset/delete',
  'PUT /core/dataset/update',
  'POST /core/dataset/data/insertImages',
  'PUT /core/dataset/training/updateTrainingData',
  'POST /core/dataset/training/rebuildEmbedding',
  'POST /core/dataset/training/deleteTrainingData'
]);

/**
 * 不使用常规请求头 API Key 鉴权、但属于开放集成闭环的特殊路由：
 * - /core/ai/model/list：公开免鉴权模型列表
 * - /system/file/u/*：使用 presignDatasetFilePostUrl 签发的短效路径 token 鉴权
 */
const SPECIAL_AUTH_OPEN_ROUTES = new Set<string>([
  '/core/ai/model/list',
  '/system/file/u/{token}',
  '/system/file/u/{token}/complete',
  '/system/file/u/{token}/abort'
]);

/**
 * 路由 handler 内部通过封装服务间接接入 authApiKey / authAppApiKey 的已知鉴权入口标识。
 */
const API_KEY_CAPABLE_PATTERNS = [
  /authApiKey\s*:\s*true/,
  /authAppApiKey\s*:\s*true/,
  /\bauthChatTargetCrud\b/,
  /\bauthChatCompletionHeaderRequest\b/,
  /\bauthModelViewer\b/,
  /\bauthSandboxSession\b/,
  /\bauthSandboxRuntimeSession\b/,
  /\bbuildChatHistoryListMatch\b/,
  /\bbuildChatHistoryMatch\b/,
  /\bbuildClearChatHistoriesMatch\b/,
  /\bdeleteDataset\b/,
  /\bmoveDataset\b/,
  /\bcreateDatasetSynonymMutation\b/,
  /\bgetAuthenticatedAppChatLogFilter\b/
];

/**
 * 从全量 OpenAPI 路由表中提取所有打了 SystemOpenApiTagMap 标签的开放操作。
 */
const collectSystemOpenApiOperations = (): CollectedSystemOperation[] => {
  const systemTags = new Set<string>(Object.values(SystemOpenApiTagMap));
  const collected: CollectedSystemOperation[] = [];

  for (const [routePath, pathItem] of Object.entries(openAPIPaths)) {
    if (pathItem === null || pathItem === undefined) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === null || operation === undefined) continue;

      const tags = operation.tags ?? [];
      if (!tags.some((tag) => systemTags.has(tag))) continue;

      const response200 = (
        operation.responses as Record<string, { content?: Record<string, unknown> }> | undefined
      )?.['200'];
      const hasSuccessContent =
        response200 !== undefined &&
        response200.content !== undefined &&
        Object.keys(response200.content).length > 0;

      collected.push({
        routePath,
        method,
        deprecated: operation.deprecated === true,
        sdkMeta: operation['x-fastgpt-sdk'],
        hasSuccessContent
      });
    }
  }

  return collected;
};

/**
 * 将 OpenAPI 路径（含 {param} 占位符）映射为 projects/app/src/pages/api 下的真实路由文件路径。
 */
const resolveAppApiHandlerFile = (routePath: string): string | null => {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const normalizedSubpath = routePath.replace(/\{([^}]+)\}/g, '[$1]');
  const apiRoot = path.join(repoRoot, 'projects/app/src/pages/api');

  const directFile = path.join(apiRoot, `${normalizedSubpath}.ts`);
  if (fs.existsSync(directFile)) {
    return directFile;
  }

  const indexFile = path.join(apiRoot, normalizedSubpath, 'index.ts');
  if (fs.existsSync(indexFile)) {
    return indexFile;
  }

  return null;
};

describe('System OpenAPI & SDK contract governance', () => {
  const operations = collectSystemOpenApiOperations();

  it('builds System OpenAPI document and covers all rendered tags in tagGroups', () => {
    expect(operations.length).toBeGreaterThan(70);
    expect(Object.keys(apiDocOpenAPIDocument.paths ?? {}).length).toBeGreaterThan(60);

    const groupedTags = new Set<string>(tagGroups.flatMap((group) => group.tags));
    for (const pathItem of Object.values(apiDocOpenAPIDocument.paths ?? {})) {
      if (pathItem === null || pathItem === undefined) continue;
      for (const method of HTTP_METHODS) {
        const op = pathItem[method as keyof typeof pathItem] as { tags?: string[] } | undefined;
        for (const tag of op?.tags ?? []) {
          expect(groupedTags.has(tag)).toBe(true);
        }
      }
    }
  });

  it('requires valid, globally unique, collision-free x-fastgpt-sdk metadata on all active operations', () => {
    const methodRegistry = new Map<string, string>();
    const resourcePaths = new Set<string>();

    for (const op of operations) {
      const opKey = `${op.method.toUpperCase()} ${op.routePath}`;

      // 1. 已废弃的历史兼容接口不进入新 SDK，禁止挂载 x-fastgpt-sdk。
      if (op.deprecated) {
        expect(
          op.sdkMeta,
          `Deprecated operation "${opKey}" must not declare x-fastgpt-sdk`
        ).toBeUndefined();
        continue;
      }

      // 2. 所有现役开放接口必须声明合法的 x-fastgpt-sdk。
      const parsed = FastGptSdkMetaSchema.safeParse(op.sdkMeta);
      expect(
        parsed.success,
        `Active System OpenAPI operation "${opKey}" must declare valid x-fastgpt-sdk metadata`
      ).toBe(true);
      if (!parsed.success) continue;

      const { resource, method, streamMethod } = parsed.data;
      resourcePaths.add(resource);

      // 3. 校验 (resource, method) 与 (resource, streamMethod) 全局唯一。
      const fullMethodPath = `${resource}.${method}`;
      expect(
        methodRegistry.has(fullMethodPath),
        `Duplicate SDK method "${fullMethodPath}" between "${methodRegistry.get(fullMethodPath)}" and "${opKey}"`
      ).toBe(false);
      methodRegistry.set(fullMethodPath, opKey);

      if (streamMethod !== undefined) {
        expect(streamMethod).not.toBe(method);
        const fullStreamPath = `${resource}.${streamMethod}`;
        expect(
          methodRegistry.has(fullStreamPath),
          `Duplicate SDK streamMethod "${fullStreamPath}" between "${methodRegistry.get(fullStreamPath)}" and "${opKey}"`
        ).toBe(false);
        methodRegistry.set(fullStreamPath, opKey);
      }
    }

    // 4. 校验方法路径与子资源命名空间不冲突（保证 Go / Java / Python / TS 属性挂载无歧义）。
    const allResourcePrefixes = new Set<string>();
    for (const res of resourcePaths) {
      const parts = res.split('.');
      for (let i = 1; i <= parts.length; i++) {
        allResourcePrefixes.add(parts.slice(0, i).join('.'));
      }
    }
    for (const [fullMethodPath, opKey] of methodRegistry.entries()) {
      expect(
        allResourcePrefixes.has(fullMethodPath),
        `SDK method "${fullMethodPath}" (${opKey}) collides with a resource namespace prefix`
      ).toBe(false);
    }
  });

  it('requires responses[200].content on every non-void active System OpenAPI operation', () => {
    const missingContentOps: string[] = [];

    for (const op of operations) {
      if (op.deprecated) continue;
      const opKey = `${op.method.toUpperCase()} ${op.routePath}`;
      if (!op.hasSuccessContent && !VOID_SYSTEM_OPENAPI_OPERATIONS.has(opKey)) {
        missingContentOps.push(opKey);
      }
      if (op.hasSuccessContent) {
        expect(
          VOID_SYSTEM_OPENAPI_OPERATIONS.has(opKey),
          `Operation "${opKey}" now declares responses[200].content; remove it from VOID_SYSTEM_OPENAPI_OPERATIONS`
        ).toBe(false);
      }
    }

    expect(missingContentOps).toEqual([]);
  });

  it('verifies every open-source System OpenAPI route handler genuinely supports API Key authentication', () => {
    const unverifiedRoutes: string[] = [];

    for (const op of operations) {
      // 商业版 /proApi/* 路由在闭源侧维护，此处仅扫描主仓存在的 API handler。
      if (op.routePath.startsWith('/proApi/')) continue;
      if (SPECIAL_AUTH_OPEN_ROUTES.has(op.routePath)) continue;

      const handlerFile = resolveAppApiHandlerFile(op.routePath);
      expect(
        handlerFile,
        `Cannot locate NextJS API route handler for System OpenAPI path "${op.routePath}"`
      ).not.toBeNull();
      if (handlerFile === null) continue;

      const source = fs.readFileSync(handlerFile, 'utf8');
      const supportsApiKey = API_KEY_CAPABLE_PATTERNS.some((pattern) => pattern.test(source));
      if (!supportsApiKey) {
        unverifiedRoutes.push(`${op.method.toUpperCase()} ${op.routePath} (${handlerFile})`);
      }
    }

    expect(unverifiedRoutes).toEqual([]);
  });
});
