import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { describe, expect, it } from 'vitest';
import {
  getDatasetSearchParamInputs,
  getDatasetSearchParams
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SelectDatasetParams.utils';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import type { ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';
import { nodeInputIsReference } from '@fastgpt/global/common/workflow/reference';
import { normalizeFlowNodeInputType } from '@fastgpt/global/core/app/formEdit/utils';
import { createEmptyTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';

describe('getDatasetSearchParams', () => {
  it('matches runtime precedence for legacy nested parameters without losing false or zero', () => {
    const params = getDatasetSearchParams([
      {
        key: NodeInputKeyEnum.datasetParams,
        value: { similarity: 0, usingReRank: false, rerankModelId: 'legacy-model' }
      },
      { key: 'similarity', value: 0.5 },
      { key: 'usingReRank', value: true }
    ]);
    expect(params).toMatchObject({
      similarity: 0,
      usingReRank: false,
      rerankModelId: 'legacy-model'
    });
  });
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
    const empty = getDatasetSearchParams([]);
    expect(empty.datasetSearchExtensionModelId).toBeUndefined();
    expect(empty.collectionFilterMatch).toBeUndefined();
    const input = { key: 'datasetSearchExtensionModelId', value: 'chosen' };
    expect(getDatasetSearchParams([input]).datasetSearchExtensionModelId).toBe('chosen');
    expect(
      getDatasetSearchParams([{ ...input, value: null }]).datasetSearchExtensionModelId
    ).toBeUndefined();
    expect(
      getDatasetSearchParams([{ key: 'collectionFilterMatch', value: '{"and":["tag1"]}' }])
        .collectionFilterMatch
    ).toBe('{"and":["tag1"]}');
  });
});
describe('getDatasetSearchParamInputs', () => {
  it('materializes missing canonical model inputs as hidden and preserves existing metadata', () => {
    const values = {
      searchMode: DatasetSearchModeEnum.embedding,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: 'chosen',
      collectionFilterMatch: '{"and":["tag1"]}'
    };
    const inputs = getDatasetSearchParamInputs({ inputs: [], values });
    expect(inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'datasetSearchExtensionModelId',
          value: 'chosen',
          renderTypeList: ['hidden']
        }),
        expect.objectContaining({
          key: 'collectionFilterMatch',
          value: '{"and":["tag1"]}',
          renderTypeList: ['hidden', 'reference']
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
  it.each([AgentNode, DatasetSearchModule])(
    'syncs filter modes and legacy settings for $flowNodeType',
    (template) => {
      const reference: ReferenceItemValueType = ['upstream', 'filterJson'];
      const values = {
        collectionFilterMatch: reference,
        similarity: 0,
        usingReRank: false,
        datasets: [
          { datasetId: 'new-dataset', name: 'New', avatar: '', vectorModel: { model: 'embedding' } }
        ]
      };
      const legacyInput = {
        key: NodeInputKeyEnum.datasetParams,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: { datasets: [{ datasetId: 'dataset-1' }], usingReRank: true }
      };
      const inputs = getDatasetSearchParamInputs({
        inputs: [...template.inputs, legacyInput],
        values
      });
      expect(nodeInputIsReference(normalizeFlowNodeInputType(inputs[0]))).toBe(true);
      expect(getDatasetSearchParams(inputs)).toMatchObject({
        collectionFilterMatch: reference,
        similarity: 0,
        usingReRank: false
      });
      expect(inputs.at(-1)?.value).toMatchObject(values);
      expect(
        inputs.find((input) => input.key === NodeInputKeyEnum.datasetSelectList)?.value
      ).toEqual(values.datasets);

      const [manualInput] = getDatasetSearchParamInputs({
        inputs,
        values: { collectionFilterMatch: { ...createEmptyTagFilterValue(), open: true } }
      });
      expect(manualInput.selectedType).toBe(
        template.inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterMatch)
          ?.renderTypeList[0]
      );

      const clearedInputs = getDatasetSearchParamInputs({
        inputs,
        values: { collectionFilterMatch: undefined }
      });
      expect(getDatasetSearchParams(clearedInputs).collectionFilterMatch).toBeUndefined();
      expect(clearedInputs.at(-1)?.value.collectionFilterMatch).toBeUndefined();
      expect(legacyInput.value.usingReRank).toBe(true);
    }
  );

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
