export type CreateVersionData = {
  skillId: string;
  tmbId: string;
  version: number;
  versionName?: string;
  storage: {
    bucket: string;
    key: string;
    size: number;
    checksum?: string;
  };
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
};

export type UpdateVersionData = Partial<Omit<CreateVersionData, 'skillId' | 'version'>>;
