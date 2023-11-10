export const PgDatasetTableName = 'modeldata';

export enum DatasetTypeEnum {
  folder = 'folder',
  dataset = 'dataset'
}

export const DatasetTypeMap = {
  [DatasetTypeEnum.folder]: {
    name: 'folder'
  },
  [DatasetTypeEnum.dataset]: {
    name: 'dataset'
  }
};

export enum DatasetCollectionTypeEnum {
  file = 'file',
  folder = 'folder',
  link = 'link',
  virtual = 'virtual'
}

export const DatasetCollectionTypeMap = {
  [DatasetCollectionTypeEnum.file]: {
    name: 'dataset.file'
  },
  [DatasetCollectionTypeEnum.folder]: {
    name: 'dataset.folder'
  },
  [DatasetCollectionTypeEnum.link]: {
    name: 'dataset.link'
  },
  [DatasetCollectionTypeEnum.virtual]: {
    name: 'dataset.Virtual File'
  }
};

export enum DatasetDataIndexTypeEnum {
  chunk = 'chunk',
  summary = 'summary',
  hypothetical = 'hypothetical',
  qa = 'qa',
  custom = 'custom'
}
export const DatasetDataIndexTypeMap = {
  [DatasetDataIndexTypeEnum.chunk]: {
    name: 'dataset.data.indexes.chunk'
  },
  [DatasetDataIndexTypeEnum.summary]: {
    name: 'dataset.data.indexes.summary'
  },
  [DatasetDataIndexTypeEnum.hypothetical]: {
    name: 'dataset.data.indexes.hypothetical'
  },
  [DatasetDataIndexTypeEnum.qa]: {
    name: 'dataset.data.indexes.qa'
  },
  [DatasetDataIndexTypeEnum.custom]: {
    name: 'dataset.data.indexes.custom'
  }
};

export enum TrainingModeEnum {
  'qa' = 'qa',
  'index' = 'index'
}
export const TrainingTypeMap = {
  [TrainingModeEnum.qa]: 'qa',
  [TrainingModeEnum.index]: 'index'
};

export const FolderAvatarSrc = '/imgs/files/folder.svg';
