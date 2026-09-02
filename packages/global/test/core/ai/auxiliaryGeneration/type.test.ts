import { describe, expect, it } from 'vitest';
import { ChatAgentHelperMetadataSchema } from '../../../../core/ai/auxiliaryGeneration/type';

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
