import { describe, expect, it } from 'vitest';
import { buildSdkIrDocument } from '../src/buildIr';
import { checkSdkArtifactsDrift } from '../src/index';

describe('OpenAPI to SDK IR Compiler & Artifacts Drift', () => {
  const ir = buildSdkIrDocument();

  it('compiles all 100 active SDK operations into 5 top-level domain resources', () => {
    expect(ir.irVersion).toBe('1.0.0');
    expect(ir.operations).toHaveLength(100);

    const topResourceNames = ir.resources.map((node) => node.name);
    expect(topResourceNames).toEqual(['apps', 'chat', 'datasets', 'models', 'system']);

    const datasetsNode = ir.resources.find((node) => node.name === 'datasets');
    expect(datasetsNode?.children.map((c) => c.name)).toEqual([
      'collections',
      'data',
      'files',
      'synonyms',
      'training'
    ]);

    const appsLogsSearch = ir.operations.find((op) => op.id === 'apps.logs.search');
    expect(appsLogsSearch?.httpMethod).toBe('POST');
    expect(appsLogsSearch?.path).toBe('/core/app/logs/search');
    expect(ir.operations.find((op) => op.id === 'apps.logs.list')).toBeUndefined();
    expect(ir.operations.find((op) => op.path === '/core/app/logs/list')).toBeUndefined();

    const chatNode = ir.resources.find((node) => node.name === 'chat');
    expect(chatNode?.children.map((c) => c.name)).toEqual([
      'feedbacks',
      'files',
      'histories',
      'records',
      'sandbox'
    ]);
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

  it('preserves required-alternative and strict mutually exclusive request union branches', () => {
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

    const retryTraining = ir.operations.find((op) => op.id === 'datasets.training.retryOrUpdate');
    expect(retryTraining?.hasRequiredInput).toBe(true);
    expect(retryTraining?.requestSchema?.kind).toBe('union');
    if (retryTraining?.requestSchema?.kind === 'union') {
      expect(retryTraining.requestSchema.variants).toHaveLength(3);
      const dataIdVariant = retryTraining.requestSchema.variants.find((variant) =>
        variant.properties.some((p) => p.name === 'dataId' && p.required)
      );
      const datasetIdVariant = retryTraining.requestSchema.variants.find((variant) =>
        variant.properties.some((p) => p.name === 'datasetId' && p.required)
      );
      const collectionIdVariant = retryTraining.requestSchema.variants.find((variant) =>
        variant.properties.some((p) => p.name === 'collectionId' && p.required)
      );

      expect(dataIdVariant).toBeDefined();
      expect(dataIdVariant?.properties.find((p) => p.name === 'datasetId')?.schema.kind).not.toBe(
        'never'
      );
      expect(
        dataIdVariant?.properties.find((p) => p.name === 'collectionId')?.schema.kind
      ).not.toBe('never');

      expect(datasetIdVariant?.properties.find((p) => p.name === 'collectionId')?.schema.kind).toBe(
        'never'
      );
      expect(collectionIdVariant?.properties.find((p) => p.name === 'datasetId')?.schema.kind).toBe(
        'never'
      );
    }
  });

  it('accurately classifies dual-mode stream, multipart, octet-stream, and all 5 response modes', () => {
    const completions = ir.operations.find((op) => op.id === 'chat.completionsV2');
    expect(completions?.streamMethod).toBe('completionsV2Stream');
    expect(completions?.responseMode).toBe('rawJson');
    expect(completions?.bodyParams).not.toContain('stream');

    const resume = ir.operations.find((op) => op.id === 'chat.resume');
    expect(resume?.streamMethod).toBe('resumeStream');
    expect(resume?.responseMode).toBe('envelope');

    const createLocalFile = ir.operations.find(
      (op) => op.id === 'datasets.collections.createByLocalFile'
    );
    expect(createLocalFile?.requestContentType).toBe('multipart');
    expect(createLocalFile?.multipartMode).toBe('fileAndJsonData');

    const insertImages = ir.operations.find((op) => op.id === 'datasets.data.insertImages');
    expect(insertImages?.requestContentType).toBe('multipart');
    expect(insertImages?.multipartMode).toBe('flatFields');

    const sandboxUpload = ir.operations.find((op) => op.id === 'chat.sandbox.upload');
    expect(sandboxUpload?.requestContentType).toBe('octet-stream');
    expect(sandboxUpload?.binaryBodyField).toBe('file');

    // 所有非 void 接口均具备明确结构化或标量返回类型，不存在退化为 unknown 的顶层响应
    const unknownTopResponses = ir.operations.filter((op) => op.responseSchema?.kind === 'unknown');
    expect(unknownTopResponses).toHaveLength(0);
  });

  it('keeps committed SDK IR and generated TypeScript sources 100% drift-free', async () => {
    const { driftedFiles } = await checkSdkArtifactsDrift();
    expect(driftedFiles).toEqual([]);
  });
});
