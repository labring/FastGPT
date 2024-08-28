/* ------------ dataset -------------- */
export enum DatasetTypeEnum {
  folder = 'folder',
  dataset = 'dataset',
  websiteDataset = 'websiteDataset', // depp link
  externalFile = 'externalFile'
}
export const DatasetTypeMap = {
  [DatasetTypeEnum.folder]: {
    icon: 'common/folderFill',
    label: 'folder_dataset',
    collectionLabel: 'common.Folder'
  },
  [DatasetTypeEnum.dataset]: {
    icon: 'core/dataset/commonDatasetOutline',
    label: 'common_dataset',
    collectionLabel: 'common.File'
  },
  [DatasetTypeEnum.websiteDataset]: {
    icon: 'core/dataset/websiteDatasetOutline',
    label: 'website_dataset',
    collectionLabel: 'common.Website'
  },
  [DatasetTypeEnum.externalFile]: {
    icon: 'core/dataset/externalDatasetOutline',
    label: 'external_file',
    collectionLabel: 'common.File'
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
  virtual = 'virtual',

  file = 'file',
  link = 'link', // one link
  externalFile = 'externalFile'
}
export const DatasetCollectionTypeMap = {
  [DatasetCollectionTypeEnum.folder]: {
    name: 'core.dataset.folder'
  },
  [DatasetCollectionTypeEnum.file]: {
    name: 'core.dataset.file'
  },
  [DatasetCollectionTypeEnum.externalFile]: {
    name: 'core.dataset.externalFile'
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

/* ------------ training -------------- */
export enum ImportDataSourceEnum {
  fileLocal = 'fileLocal',
  fileLink = 'fileLink',
  fileCustom = 'fileCustom',
  csvTable = 'csvTable',
  externalFile = 'externalFile'
}

export enum TrainingModeEnum {
  chunk = 'chunk',
  auto = 'auto',
  qa = 'qa'
}

export const TrainingTypeMap = {
  [TrainingModeEnum.chunk]: {
    label: 'core.dataset.training.Chunk mode',
    tooltip: 'core.dataset.import.Chunk Split Tip',
    openSource: true
  },
  [TrainingModeEnum.auto]: {
    label: 'core.dataset.training.Auto mode',
    tooltip: 'core.dataset.training.Auto mode Tip',
    openSource: false
  },
  [TrainingModeEnum.qa]: {
    label: 'core.dataset.training.QA mode',
    tooltip: 'core.dataset.import.QA Import Tip',
    openSource: true
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

export const CustomCollectionIcon = 'common/linkBlue';
export const LinkCollectionIcon = 'common/linkBlue';

/* source prefix */
export enum DatasetSourceReadTypeEnum {
  fileLocal = 'fileLocal',
  link = 'link',
  externalFile = 'externalFile'
}
