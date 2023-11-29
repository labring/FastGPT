export const PgDatasetTableName = 'modeldata';

/* ------------ dataset -------------- */
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

/* ------------ collection -------------- */
export enum DatasetCollectionTypeEnum {
  folder = 'folder',
  file = 'file',
  link = 'link',
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
