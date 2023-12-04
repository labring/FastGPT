export const PgDatasetTableName = 'modeldata';

/* ------------ dataset -------------- */
export enum DatasetTypeEnum {
  folder = 'folder',
  dataset = 'dataset',
  websiteDataset = 'websiteDataset' // depp link
}
export const DatasetTypeMap = {
  [DatasetTypeEnum.folder]: {
    icon: 'core/dataset/folderDataset',
    label: 'core.dataset.Folder Dataset',
    collectionLabel: 'common.Folder'
  },
  [DatasetTypeEnum.dataset]: {
    icon: 'core/dataset/commonDataset',
    label: 'core.dataset.Common Dataset',
    collectionLabel: 'common.File'
  },
  [DatasetTypeEnum.websiteDataset]: {
    icon: 'core/dataset/websiteDataset',
    label: 'core.dataset.Website Dataset',
    collectionLabel: 'common.Website'
  }
};

export enum DatasetStatusEnum {
  active = 'active',
  syncing = 'syncing'
}
export const DatasetStatusMap = {
  [DatasetStatusEnum.active]: {
    label: 'core.dataset.status.active'
  },
  [DatasetStatusEnum.syncing]: {
    label: 'core.dataset.status.syncing'
  }
};

/* ------------ collection -------------- */
export enum DatasetCollectionTypeEnum {
  folder = 'folder',
  file = 'file',
  link = 'link', // one link
  virtual = 'virtual'
}
export const DatasetCollectionTypeMap = {
  [DatasetCollectionTypeEnum.folder]: {
    name: 'core.dataset.folder'
  },
  [DatasetCollectionTypeEnum.file]: {
    name: 'core.dataset.file'
  },
  [DatasetCollectionTypeEnum.link]: {
    name: 'core.dataset.link'
  },
  [DatasetCollectionTypeEnum.virtual]: {
    name: 'core.dataset.Virtual File'
  }
};
export enum DatasetCollectionTrainingModeEnum {
  manual = 'manual',
  chunk = 'chunk',
  qa = 'qa'
}
export const DatasetCollectionTrainingTypeMap = {
  [DatasetCollectionTrainingModeEnum.manual]: {
    label: 'core.dataset.collection.training.type manual'
  },
  [DatasetCollectionTrainingModeEnum.chunk]: {
    label: 'core.dataset.collection.training.type chunk'
  },
  [DatasetCollectionTrainingModeEnum.qa]: {
    label: 'core.dataset.collection.training.type qa'
  }
};

/* ------------ data -------------- */
export enum DatasetDataIndexTypeEnum {
  chunk = 'chunk',
  qa = 'qa',
  summary = 'summary',
  hypothetical = 'hypothetical',
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

/* ------------ training -------------- */
export enum TrainingModeEnum {
  chunk = 'chunk',
  qa = 'qa'
}

export const TrainingTypeMap = {
  [TrainingModeEnum.chunk]: {
    label: 'core.dataset.training.type chunk'
  },
  [TrainingModeEnum.qa]: {
    label: 'core.dataset.training.type qa'
  }
};

/* ------------ search -------------- */
export enum DatasetSearchModeEnum {
  embedding = 'embedding',
  embeddingReRank = 'embeddingReRank',
  embFullTextReRank = 'embFullTextReRank'
}

export const DatasetSearchModeMap = {
  [DatasetSearchModeEnum.embedding]: {
    icon: 'core/dataset/modeEmbedding',
    title: 'core.dataset.search.mode.embedding',
    desc: 'core.dataset.search.mode.embedding desc',
    value: DatasetSearchModeEnum.embedding
  },
  [DatasetSearchModeEnum.embeddingReRank]: {
    icon: 'core/dataset/modeEmbeddingRerank',
    title: 'core.dataset.search.mode.embeddingReRank',
    desc: 'core.dataset.search.mode.embeddingReRank desc',
    value: DatasetSearchModeEnum.embeddingReRank
  },
  [DatasetSearchModeEnum.embFullTextReRank]: {
    icon: 'core/dataset/modeEmbFTRerank',
    title: 'core.dataset.search.mode.embFullTextReRank',
    desc: 'core.dataset.search.mode.embFullTextReRank desc',
    value: DatasetSearchModeEnum.embFullTextReRank
  }
};

export const FolderAvatarSrc = '/imgs/files/folder.svg';
