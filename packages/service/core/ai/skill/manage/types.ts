import type { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';

export type CreateSkillData = {
  skillId?: string;
  parentId?: string | null;
  name: string;
  description: string;
  category: string[];
  avatar?: string;
  teamId: string;
  tmbId: string;
  creationStatus?: AgentSkillCreationStatusEnum;
  creationPayload?: {
    requirements?: string;
  };
};

// UpdateSkillData excludes markdown to ensure consistency with version management.
// Markdown updates must go through version workflow to keep package.zip in sync.
export type UpdateSkillData = Partial<
  Pick<CreateSkillData, 'name' | 'description' | 'category' | 'avatar'>
>;
