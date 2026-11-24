import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { describe, expect, it } from 'vitest';
import { buildSdkIrDocument } from '../src/buildIr';
import { checkSdkArtifactsDrift } from '../src/index';
import {
  emitPythonModelsFile,
  emitPythonResourcesFile,
  toPythonSnakeCase
} from '../src/pythonEmitter';
import { normalizeRequestSchemaToIr } from '../src/schemaNormalizer';
import { emitTypeScriptResourcesFile } from '../src/tsEmitter';

const collectExpectedActiveSystemOps = (): string[] => {
  const keys: string[] = [];
  for (const [routePath, pathItem] of Object.entries(apiDocOpenAPIDocument.paths ?? {})) {
    if (pathItem === null || pathItem === undefined) continue;
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const op = pathItem[method] as { deprecated?: boolean } | undefined;
      if (op === undefined || op.deprecated === true) continue;
      keys.push(`${method.toUpperCase()} ${routePath}`);
    }
  }
  return keys.sort();
};

describe('OpenAPI to SDK IR Compiler & Artifacts Drift', () => {
  const ir = buildSdkIrDocument();

  it('compiles every active System OpenAPI operation into 4 top-level domain resources', () => {
    expect(ir.irVersion).toBe('1.0.0');
    const expectedOpKeys = collectExpectedActiveSystemOps();
    const compiledOpKeys = ir.operations.map((op) => `${op.httpMethod} ${op.path}`).sort();
    expect(ir.operations.length).toBeGreaterThan(0);
    expect(compiledOpKeys).toEqual(expectedOpKeys);

    const topResourceNames = ir.resources.map((node) => node.name);
    expect(topResourceNames).toEqual(['apps', 'chat', 'datasets', 'models']);

    const datasetsNode = ir.resources.find((node) => node.name === 'datasets');
    expect(datasetsNode?.children.map((c) => c.name)).toEqual(['collections', 'data']);

    const appsLogsSearch = ir.operations.find((op) => op.id === 'apps.logs.search');
    expect(appsLogsSearch?.httpMethod).toBe('POST');
    expect(appsLogsSearch?.path).toBe('/core/app/logs/search');

    // 已废弃接口与非 SystemOpenApiTagMap 站内接口不得进入生成层 SDK
    expect(ir.operations.find((op) => op.id === 'apps.logs.list')).toBeUndefined();
    expect(ir.operations.find((op) => op.path === '/core/app/logs/list')).toBeUndefined();
    expect(ir.operations.find((op) => op.id === 'system.whoami')).toBeUndefined();
    expect(ir.operations.find((op) => op.id === 'system.health')).toBeUndefined();
    expect(ir.operations.find((op) => op.id === 'datasets.training.retryOrUpdate')).toBeUndefined();
    expect(ir.operations.find((op) => op.id === 'chat.sandbox.upload')).toBeUndefined();

    const chatNode = ir.resources.find((node) => node.name === 'chat');
    expect(chatNode?.children.map((c) => c.name)).toEqual(['feedbacks', 'histories', 'records']);
  });

  it('flattens complex allOf/anyOf request unions and strips internal non-SDK fields', () => {
    const historiesList = ir.operations.find((op) => op.id === 'chat.histories.list');
    expect(historiesList).toBeDefined();
    expect(historiesList?.appIdCarrier).toBe('body');
    expect(historiesList?.identityCarrier).toBe('body');
    expect(historiesList?.bodyParams).toEqual(
      expect.arrayContaining([
        'appId',
        'offset',
        'pageNum',
        'pageSize',
        'source',
        'customUid',
        'authProxy'
      ])
    );

    // 确认站内调试与分享外链专属字段不会泄漏到对外 SDK 请求模型
    for (const op of ir.operations) {
      const allInputNames = [...op.pathParams, ...op.queryParams, ...op.bodyParams];
      expect(allInputNames).not.toContain('skillId');
      expect(allInputNames).not.toContain('shareId');
      expect(allInputNames).not.toContain('outLinkAuthData');
    }

    // 确认响应模型中 z.intersection(Base, Union) 正确按分配律保留公共字段
    expect(historiesList?.responseSchema?.kind).toBe('object');
    if (historiesList?.responseSchema?.kind === 'object') {
      const listProp = historiesList.responseSchema.properties.find((p) => p.name === 'list');
      expect(listProp?.schema.kind).toBe('array');
      if (listProp?.schema.kind === 'array' && listProp.schema.items.kind === 'union') {
        for (const variant of listProp.schema.items.variants) {
          expect(variant.kind).toBe('object');
          if (variant.kind === 'object') {
            const propNames = variant.properties.map((p) => p.name);
            expect(propNames).toContain('chatId');
            expect(propNames).toContain('title');
          }
        }
      }
    }
  });

  it('unwraps exploded query unions and supports structured authProxy on query routes', () => {
    const chatInit = ir.operations.find((op) => op.id === 'chat.init');
    expect(chatInit).toBeDefined();
    expect(chatInit?.appIdCarrier).toBe('query');
    expect(chatInit?.identityCarrier).toBe('query');
    expect(chatInit?.queryParams).toEqual([
      'appId',
      'chatId',
      'loadCustomFeedbacks',
      'customUid',
      'authProxy'
    ]);

    expect(chatInit?.requestSchema?.kind).toBe('object');
    if (chatInit?.requestSchema?.kind === 'object') {
      const authProxyProp = chatInit.requestSchema.properties.find((p) => p.name === 'authProxy');
      expect(authProxyProp?.schema.kind).toBe('union');
    }
  });

  it('preserves required-alternative, mutually exclusive unions, and branch not.required never constraints', () => {
    const deleteCol = ir.operations.find((op) => op.id === 'datasets.collections.delete');
    expect(deleteCol).toBeDefined();
    expect(deleteCol?.queryParams).toEqual([]);
    expect(deleteCol?.hasRequiredInput).toBe(true);
    expect(deleteCol?.requestSchema?.kind).toBe('union');
    if (deleteCol?.requestSchema?.kind === 'union') {
      expect(deleteCol.requestSchema.variants).toHaveLength(3);
      const requiredSets = deleteCol.requestSchema.variants.map((variant) =>
        variant.properties
          .filter((p) => p.required)
          .map((p) => p.name)
          .sort()
      );
      expect(requiredSets).toEqual([['id'], ['collectionIds'], ['apiFileIds', 'datasetId']]);

      // 每个严格分支必须对其他分支的定位字段注入 never 互斥约束
      for (const variant of deleteCol.requestSchema.variants) {
        const neverNames = variant.properties
          .filter((p) => p.schema.kind === 'never')
          .map((p) => p.name);
        expect(neverNames.length).toBeGreaterThan(0);
      }
    }

    const updateCol = ir.operations.find((op) => op.id === 'datasets.collections.update');
    expect(updateCol?.hasRequiredInput).toBe(true);
    expect(updateCol?.requestSchema?.kind).toBe('union');

    // 验证单键 not.required 与 not.anyOf（德摩根律）转换为分支内 never 字段
    const normalizedMutualExclusion = normalizeRequestSchemaToIr({
      rootDoc: {},
      rawSchema: {
        anyOf: [
          {
            type: 'object',
            properties: {
              dataId: { type: 'string' },
              datasetId: { type: 'string' },
              collectionId: { type: 'string' }
            },
            required: ['dataId']
          },
          {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              collectionId: { type: 'string' }
            },
            required: ['datasetId'],
            not: { required: ['collectionId'] }
          },
          {
            type: 'object',
            properties: {
              dataId: { type: 'string' },
              datasetId: { type: 'string' },
              collectionId: { type: 'string' }
            },
            required: ['collectionId'],
            not: { anyOf: [{ required: ['datasetId'] }, { required: ['dataId'] }] }
          }
        ]
      }
    });
    expect(normalizedMutualExclusion.kind).toBe('union');
    if (normalizedMutualExclusion.kind === 'union') {
      expect(normalizedMutualExclusion.variants).toHaveLength(3);
      const [vData, vDs, vCol] = normalizedMutualExclusion.variants;
      expect(vData?.properties.find((p) => p.name === 'collectionId')?.schema.kind).not.toBe(
        'never'
      );
      expect(vDs?.properties.find((p) => p.name === 'collectionId')?.schema.kind).toBe('never');
      expect(vCol?.properties.find((p) => p.name === 'datasetId')?.schema.kind).toBe('never');
      expect(vCol?.properties.find((p) => p.name === 'dataId')?.schema.kind).toBe('never');
    }
  });

  it('accurately classifies dual-mode stream, multipart, binary, and void response modes', () => {
    const completions = ir.operations.find((op) => op.id === 'chat.completionsV2');
    expect(completions?.streamMethod).toBe('completionsV2Stream');
    expect(completions?.responseMode).toBe('rawJson');
    expect(completions?.bodyParams).not.toContain('stream');

    const createLocalFile = ir.operations.find(
      (op) => op.id === 'datasets.collections.createByLocalFile'
    );
    expect(createLocalFile?.requestContentType).toBe('multipart');
    expect(createLocalFile?.multipartMode).toBe('fileAndJsonData');

    const batchDownload = ir.operations.find(
      (op) => op.id === 'datasets.collections.batchDownload'
    );
    expect(batchDownload?.responseMode).toBe('binary');
    expect(batchDownload?.retryable).toBe(false);
    expect(emitTypeScriptResourcesFile(ir)).toContain('"retryable": false');

    const deleteDataset = ir.operations.find((op) => op.id === 'datasets.delete');
    expect(deleteDataset?.responseMode).toBe('void');

    // 所有非 void 接口均具备明确结构化或标量返回类型，不存在退化为 unknown 的顶层响应
    const unknownTopResponses = ir.operations.filter((op) => op.responseSchema?.kind === 'unknown');
    expect(unknownTopResponses).toHaveLength(0);
  });

  it('emits Python Pydantic models and Sync/Async resource trees with snake_case, safe aliasing, and never constraints', () => {
    expect(toPythonSnakeCase('completionsV2Stream')).toBe('completions_v2_stream');
    expect(toPythonSnakeCase('paragraphChunkAIMode')).toBe('paragraph_chunk_ai_mode');
    expect(toPythonSnakeCase('zh-Hant')).toBe('zh_hant');

    const pyModels = emitPythonModelsFile(ir);
    const pyResources = emitPythonResourcesFile(ir);

    // `_id` 字段映射到 `id_` 且不影响同级 `id`，互斥 `never` 字段使用 `exclude=True`
    expect(pyModels).toContain(
      'id_: str = Field(validation_alias=AliasChoices("id_", "_id"), serialization_alias="_id"'
    );
    expect(pyModels).toContain(
      'collection_ids: None = Field(default=None, validation_alias=AliasChoices("collection_ids", "collectionIds"), serialization_alias="collectionIds", exclude=True'
    );
    expect(pyModels).toContain('_builtins.list[');

    // Sync / Async / WithRawResponse / 双模态流式方法齐全，且对象与数组联合入参放宽为 Mapping/Sequence
    expect(pyResources).toContain('class ChatResource:');
    expect(pyResources).toContain('class AsyncChatResource:');
    expect(pyResources).toContain('class WithRawResponseChatResource:');
    expect(pyResources).toContain('class AsyncWithRawResponseChatResource:');
    expect(pyResources).toContain('def completions_v2_stream(');
    expect(pyResources).toContain('async def completions_v2_stream(');
    expect(pyResources).toContain('retryable=False');
    expect(pyResources).toContain(
      'messages: Sequence[ChatCompletionsV2ReqMessagesItem | Mapping[str, Any]]'
    );
  });

  it('keeps committed SDK IR and generated TypeScript/Python sources 100% drift-free', async () => {
    const { driftedFiles } = await checkSdkArtifactsDrift();
    expect(driftedFiles).toEqual([]);
  });
});
