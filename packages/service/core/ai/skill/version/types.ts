import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';

export type CreateVersionData = {
  versionId?: string;
  skillId: string;
  tmbId: string;
  versionName?: string;
  storageKey: string;
  runtimeSkills: RuntimeSkillMetadataType[];
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
};

export type UpdateVersionData = Partial<Omit<CreateVersionData, 'versionId' | 'skillId'>>;
