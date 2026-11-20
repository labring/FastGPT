import type {
  RuntimeSkillMetadataType,
  SkillEntryContractType
} from '@fastgpt/global/core/ai/skill/type';

export type CreateVersionData = {
  versionId?: string;
  skillId: string;
  tmbId: string;
  versionName?: string;
  storageKey: string;
  runtimeSkills: RuntimeSkillMetadataType[];
  // 仅新发布链路写入；旧版本/导入版本不写，运行态按递归扫描兼容。
  skillEntryContract?: SkillEntryContractType;
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
};

export type UpdateVersionData = Partial<Omit<CreateVersionData, 'versionId' | 'skillId'>>;
