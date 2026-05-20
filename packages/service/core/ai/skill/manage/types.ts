import type { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';

export type CreateSkillData = {
  parentId?: string | null;
  name: string;
  description: string;
  author: string;
  category: string[];
  config: Record<string, any>;
  avatar?: string;
  teamId: string;
  tmbId: string;
  creationStatus?: AgentSkillCreationStatusEnum;
  creationPayload?: {
    requirements?: string;
    model?: string;
  };
};

// UpdateSkillData excludes markdown to ensure consistency with version management.
// Markdown updates must go through version workflow to keep package.zip in sync.
export type UpdateSkillData = Partial<
  Pick<CreateSkillData, 'name' | 'description' | 'category' | 'config' | 'avatar'>
>;

export type SkillStorageRef = {
  bucket: string;
  key: string;
  size: number;
};
