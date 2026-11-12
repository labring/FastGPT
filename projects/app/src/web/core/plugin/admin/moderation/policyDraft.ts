import { create } from '@fastgpt/web/common/zustand';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';

type State = {
  draft?: SystemModerationPolicyType;
  setDraft: (draft?: SystemModerationPolicyType) => void;
};

/** Keep the unsaved policy across client-side marketplace navigation, without persisting it across reloads. */
export const useModerationPolicyDraftStore = create<State>()((set) => ({
  draft: undefined,
  setDraft: (draft) => set({ draft })
}));
