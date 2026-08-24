import { describe, expect, it } from 'vitest';
import { defaultEditFormData } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderToolInput/EditFieldModal';

describe('RenderToolInput EditFieldModal', () => {
  it('creates new dynamic tool params with the Agent-generated default', () => {
    expect(defaultEditFormData.defaultToAgentGenerated).toBe(true);
  });
});
