export type CreateVersionData = {
  versionId?: string;
  skillId: string;
  tmbId: string;
  versionName?: string;
  storageKey: string;
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
};

export type UpdateVersionData = Partial<Omit<CreateVersionData, 'versionId' | 'skillId'>>;
