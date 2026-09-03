import { getModelInputOptions } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.utils';
import { describe, expect, it } from 'vitest';

describe('getModelInputOptions', () => {
  it('uses stable modelId values instead of provider model names', () => {
    expect(
      getModelInputOptions([
        { modelId: 'model-id-1', name: 'DeepSeek V4 Flash' },
        { modelId: 'model-id-2', name: 'GPT-5' }
      ])
    ).toEqual([
      { value: 'model-id-1', label: 'DeepSeek V4 Flash' },
      { value: 'model-id-2', label: 'GPT-5' }
    ]);
  });

  it('returns an empty option list when no models are available', () => {
    expect(getModelInputOptions([])).toEqual([]);
  });
});
