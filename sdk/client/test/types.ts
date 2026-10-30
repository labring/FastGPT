import type { FastGPT } from '../src/client';
import type { DatasetInput, DatasetOutput, SearchParams } from '../src/dataset/type';

/** 仅由 tsc 检查：公开输入保留必填、默认值、公开操作边界及输出日期语义。 */
export const verifyPublicTypes = async (client: FastGPT) => {
  const id: string = await client.datasets.create({ name: 'Docs' });
  const search: SearchParams = { scope: { datasetIds: [id] }, query: { text: 'question' } };
  const result = await client.datasets.search(search);
  const mode: 'embedding' | 'fullTextRecall' | 'mixedRecall' = result.meta.searchMode;
  const dataset = await client.datasets.get({ id });
  const updatedAt: string = dataset.updateTime;
  const collection: DatasetInput<'collections.importText'> = {
    datasetId: id,
    name: 'Intro',
    text: 'content'
  };
  const output: DatasetOutput<'create'> = id;
  await client.datasets.collections.importText(collection);
  // @ts-expect-error dataset identifier is required
  await client.datasets.get({});
  // @ts-expect-error resource identifiers are strings over HTTP
  await client.datasets.get({ id: 123 });
  // @ts-expect-error a disabled reranker cannot carry a model
  await client.datasets.search({ ...search, rerank: { enabled: false, modelId: 'reranker' } });
  // @ts-expect-error internal resource management APIs are not exposed
  await client.datasets.collaborators.list({ datasetId: id });
  // @ts-expect-error internal training APIs are not exposed
  await client.datasets.training.queue({ datasetId: id });
  // @ts-expect-error create returns an identifier rather than a dataset object
  const invalid: { id: string } = output;
  return { mode, updatedAt, invalid };
};
