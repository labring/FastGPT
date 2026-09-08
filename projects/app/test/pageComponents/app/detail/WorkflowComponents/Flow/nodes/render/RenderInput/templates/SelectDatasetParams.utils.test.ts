import { describe, expect, it } from 'vitest';
import {
  getDatasetSearchParamInputs,
  getDatasetSearchParams
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SelectDatasetParams.utils';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

describe('getDatasetSearchParams', () => {
  it.each([undefined, null, false])(
    'keeps absent or disabled feature switches off in the summary (%s)',
    (value) => {
      const empty = getDatasetSearchParams([]);
      expect(empty.datasetSearchUsingExtensionQuery).toBe(false);
      expect(empty.usingReRank).toBe(false);
      const params = getDatasetSearchParams([
        { key: 'datasetSearchUsingExtensionQuery', value },
        { key: 'usingReRank', value }
      ]);
      expect(params.datasetSearchUsingExtensionQuery).toBe(false);
      expect(params.usingReRank).toBe(false);
      expect(
        getDatasetSearchParams([{ key: 'datasetSearchUsingExtensionQuery', value: true }])
          .datasetSearchUsingExtensionQuery
      ).toBe(true);
    }
  );
  it('shows only persisted model choices and can read initially empty keys', () => {
    expect(getDatasetSearchParams([]).datasetSearchExtensionModelId).toBeUndefined();
    const input = { key: 'datasetSearchExtensionModelId', value: 'chosen' };
    expect(getDatasetSearchParams([input]).datasetSearchExtensionModelId).toBe('chosen');
    expect(
      getDatasetSearchParams([{ ...input, value: null }]).datasetSearchExtensionModelId
    ).toBeUndefined();
    expect(
      getDatasetSearchParams([{ key: 'datasetSearchUsingExtensionQuery', value: false }])
        .datasetSearchUsingExtensionQuery
    ).toBe(false);
  });
});
describe('getDatasetSearchParamInputs', () => {
  it('materializes missing canonical model inputs and preserves existing metadata', () => {
    const values = {
      searchMode: DatasetSearchModeEnum.embedding,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: 'chosen'
    };
    const inputs = getDatasetSearchParamInputs({ inputs: [], values });
    expect(inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'datasetSearchExtensionModelId',
          value: 'chosen',
          renderTypeList: ['hidden']
        })
      ])
    );
    const original = inputs.map((i) => ({ ...i, debugLabel: 'preserved' }));
    const next = getDatasetSearchParamInputs({
      inputs: original,
      values: { ...values, datasetSearchExtensionModelId: 'changed' }
    });
    expect(next.find((i) => i.key === 'datasetSearchExtensionModelId')).toMatchObject({
      value: 'changed',
      debugLabel: 'preserved'
    });
    expect(getDatasetSearchParams(next).datasetSearchExtensionModelId).toBe('changed');
    expect(original.find((i) => i.key === 'datasetSearchExtensionModelId')?.value).toBe('chosen');
  });
  it('does not create inputs for unknown legacy-only keys', () => {
    expect(
      getDatasetSearchParamInputs({
        inputs: [],
        values: {
          searchMode: DatasetSearchModeEnum.embedding,
          datasetSearchExtensionModel: 'legacy'
        }
      }).some((i) => i.key === 'datasetSearchExtensionModel')
    ).toBe(false);
  });
});
