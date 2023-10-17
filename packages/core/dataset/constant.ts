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

export enum FileStatusEnum {
  embedding = 'embedding',
  ready = 'ready'
}

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
