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
    name: 'core.dataset.Manual collection'
  }
};

export enum DatasetCollectionSyncResultEnum {
  sameRaw = 'sameRaw',
  success = 'success'
}
export const DatasetCollectionSyncResultMap = {
  [DatasetCollectionSyncResultEnum.sameRaw]: {
    label: 'core.dataset.collection.sync.result.sameRaw'
  },
  [DatasetCollectionSyncResultEnum.success]: {
    label: 'core.dataset.collection.sync.result.success'
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
  fullTextRecall = 'fullTextRecall',
  mixedRecall = 'mixedRecall'
}

export const DatasetSearchModeMap = {
  [DatasetSearchModeEnum.embedding]: {
    icon: 'core/dataset/modeEmbedding',
    title: 'core.dataset.search.mode.embedding',
    desc: 'core.dataset.search.mode.embedding desc',
    value: DatasetSearchModeEnum.embedding
  },
  [DatasetSearchModeEnum.fullTextRecall]: {
    icon: 'core/dataset/fullTextRecall',
    title: 'core.dataset.search.mode.fullTextRecall',
    desc: 'core.dataset.search.mode.fullTextRecall desc',
    value: DatasetSearchModeEnum.fullTextRecall
  },
  [DatasetSearchModeEnum.mixedRecall]: {
    icon: 'core/dataset/mixedRecall',
    title: 'core.dataset.search.mode.mixedRecall',
    desc: 'core.dataset.search.mode.mixedRecall desc',
    value: DatasetSearchModeEnum.mixedRecall
  }
};

export enum SearchScoreTypeEnum {
  embedding = 'embedding',
  fullText = 'fullText',
  reRank = 'reRank',
  rrf = 'rrf'
}
export const SearchScoreTypeMap = {
  [SearchScoreTypeEnum.embedding]: {
    label: 'core.dataset.search.score.embedding',
    desc: 'core.dataset.search.score.embedding desc',
    showScore: true
  },
  [SearchScoreTypeEnum.fullText]: {
    label: 'core.dataset.search.score.fullText',
    desc: 'core.dataset.search.score.fullText desc',
    showScore: false
  },
  [SearchScoreTypeEnum.reRank]: {
    label: 'core.dataset.search.score.reRank',
    desc: 'core.dataset.search.score.reRank desc',
    showScore: true
  },
  [SearchScoreTypeEnum.rrf]: {
    label: 'core.dataset.search.score.rrf',
    desc: 'core.dataset.search.score.rrf desc',
    showScore: false
  }
};

export const FolderAvatarSrc = '/imgs/files/folder.svg';
