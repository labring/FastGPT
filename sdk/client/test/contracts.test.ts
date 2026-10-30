import { describe, expect, it } from 'vitest';
import { DatasetPath } from '@fastgpt/global/openapi/core/dataset';
import { SystemOpenApiTagMap } from '@fastgpt/global/openapi/tag';
import { datasetOperations } from '../src/dataset/operations';
import { FastGPT } from '../src/client';

describe('public knowledge base Open API scope', () => {
  it('covers exactly the active public operations declared by the official API document', () => {
    const tags = new Set<string>(Object.values(SystemOpenApiTagMap));
    const publicOperations = Object.entries(DatasetPath ?? {}).flatMap(([path, methods]) =>
      Object.entries(methods).flatMap(([method, operation]) =>
        !operation.deprecated && operation.tags?.some((tag: string) => tags.has(tag))
          ? [`${method.toUpperCase()} ${path}`]
          : []
      )
    );
    const sdkOperations = Object.values(datasetOperations).map(
      ({ method, path }) => `${method} /${path}`
    );
    // 联合搜索单独在 #8194 引入；该 PR 合并前也能独立构建和测试客户端。
    const pendingSearch = publicOperations.includes('POST /core/dataset/search')
      ? []
      : ['POST /core/dataset/search'];
    expect(sdkOperations.sort()).toEqual([...publicOperations, ...pendingSearch].sort());
  });

  it('keeps internal console resources out of the SDK surface', () => {
    const datasets = new FastGPT({ baseURL: 'http://localhost:3000', apiKey: 'test-key' }).datasets;
    for (const resource of ['collaborators', 'tags', 'synonyms', 'sources', 'training', 'files']) {
      expect(datasets).not.toHaveProperty(resource);
    }
    expect(datasets.collections).not.toHaveProperty('collaborators');
    expect(datasets.chunks).not.toHaveProperty('indexes');
  });
});
