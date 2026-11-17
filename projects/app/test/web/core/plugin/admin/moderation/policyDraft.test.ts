import { afterEach, describe, expect, it } from 'vitest';
import { useModerationPolicyDraftStore } from '@/web/core/plugin/admin/moderation/policyDraft';
import { DefaultSystemModerationPolicy } from '@fastgpt/global/core/plugin/moderation/type';

describe('moderation policy marketplace draft', () => {
  afterEach(() => useModerationPolicyDraftStore.getState().setDraft(undefined));

  it('retains unsaved fields for a new page consumer and clears them after restoration', () => {
    const draft = {
      ...DefaultSystemModerationPolicy,
      enabled: true,
      hooks: { userInput: false, modelInput: true, finalOutput: true },
      strategy: { ...DefaultSystemModerationPolicy.strategy, streamInterval: 120 }
    };
    useModerationPolicyDraftStore.getState().setDraft(draft);

    const restoredPolicy = useModerationPolicyDraftStore.getState().draft;
    useModerationPolicyDraftStore.getState().setDraft(undefined);

    expect(restoredPolicy).toEqual(draft);
    expect(restoredPolicy?.enabled).toBe(true);
    expect(useModerationPolicyDraftStore.getState().draft).toBeUndefined();
  });
});
