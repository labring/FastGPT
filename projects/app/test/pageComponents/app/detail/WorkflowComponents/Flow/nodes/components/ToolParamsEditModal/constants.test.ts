import { describe, expect, it } from 'vitest';
import { defaultToolParamFormData } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/components/ToolParamsEditModal/constants';

describe('ToolParamsEditModal constants', () => {
  it('creates new dynamic tool params with the Agent-generated default', () => {
    expect(defaultToolParamFormData.defaultToAgentGenerated).toBe(true);
  });
});
