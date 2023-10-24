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

export enum TrainingModeEnum {
  'qa' = 'qa',
  'index' = 'index'
}
export const TrainingTypeMap = {
  [TrainingModeEnum.qa]: 'qa',
  [TrainingModeEnum.index]: 'index'
};

export enum DatasetSpecialIdEnum {
  manual = 'manual',
  mark = 'mark'
}
export const datasetSpecialIdMap = {
  [DatasetSpecialIdEnum.manual]: {
    name: 'kb.Manual Data',
    sourceName: 'kb.Manual Input'
  },
  [DatasetSpecialIdEnum.mark]: {
    name: 'kb.Mark Data',
    sourceName: 'kb.Manual Mark'
  }
};
export const datasetSpecialIds: string[] = [DatasetSpecialIdEnum.manual, DatasetSpecialIdEnum.mark];

export const FolderAvatarSrc = '/imgs/files/folder.svg';
