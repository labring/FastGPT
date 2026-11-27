import { describe, expect, it } from 'vitest';
import {
  ChatAgentConfigFormDataSchema,
  ChatAgentHelperMetadataSchema
} from '../../../../core/ai/auxiliaryGeneration/type';
import { SelectedDatasetSchema } from '../../../../core/workflow/type/io';

describe('ChatAgentHelperMetadataSchema', () => {
  it('keeps modelId and strips unknown fields from the internal model config', () => {
    expect(
      ChatAgentHelperMetadataSchema.parse({
        modelConfig: {
          modelId: '68ad85a7463006c963799a05',
          model: 'gpt-4.1-mini',
          unknownField: true
        }
      }).modelConfig
    ).toEqual({ modelId: '68ad85a7463006c963799a05' });
  });
});

describe('ChatAgentConfigFormDataSchema', () => {
  it('allows datasets with missing or legacy null avatar', () => {
    const parsed = ChatAgentConfigFormDataSchema.parse({
      datasets: [
        {
          datasetId: '68ad85a7463006c963799a05',
          name: 'KB',
          vectorModel: { model: 'text-embedding-3-small' }
        },
        {
          datasetId: '68ad85a7463006c963799a06',
          avatar: null,
          name: 'Legacy KB',
          vectorModel: { model: 'text-embedding-3-small' }
        }
      ]
    });
    expect(parsed.datasets[0]?.avatar).toBeUndefined();
    expect(parsed.datasets[1]?.avatar).toBeUndefined();
    expect(
      SelectedDatasetSchema.parse({
        datasetId: '68ad85a7463006c963799a06',
        avatar: null,
        name: 'Legacy KB',
        vectorModel: { model: 'text-embedding-3-small' }
      }).avatar
    ).toBeUndefined();
  });
});
