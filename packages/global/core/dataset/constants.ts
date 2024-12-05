import { i18nT } from '../../../web/i18n/utils';

/* ------------ dataset -------------- */
export enum DatasetTypeEnum {
  folder = 'folder',
  dataset = 'dataset',
  websiteDataset = 'websiteDataset', // depp link
  externalFile = 'externalFile',
  apiDataset = 'apiDataset'
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
  },
  [DatasetTypeEnum.apiDataset]: {
    icon: 'core/dataset/externalDatasetOutline',
    label: 'api_file',
    collectionLabel: 'common.File'
  }
};

export enum DatasetStatusEnum {
  active = 'active',
  syncing = 'syncing'
}
export const DatasetStatusMap = {
  [DatasetStatusEnum.active]: {
    label: i18nT('common:core.dataset.status.active')
  },
  [DatasetStatusEnum.syncing]: {
    label: i18nT('common:core.dataset.status.syncing')
  }
};

/* ------------ collection -------------- */
export enum DatasetCollectionTypeEnum {
  folder = 'folder',
  virtual = 'virtual',

  file = 'file',
  link = 'link', // one link
  externalFile = 'externalFile',
  apiFile = 'apiFile'
}
export const DatasetCollectionTypeMap = {
  [DatasetCollectionTypeEnum.folder]: {
    name: i18nT('common:core.dataset.folder')
  },
  [DatasetCollectionTypeEnum.file]: {
    name: i18nT('common:core.dataset.file')
  },
  [DatasetCollectionTypeEnum.externalFile]: {
    name: i18nT('common:core.dataset.externalFile')
  },
  [DatasetCollectionTypeEnum.link]: {
    name: i18nT('common:core.dataset.link')
  },
  [DatasetCollectionTypeEnum.virtual]: {
    name: i18nT('common:core.dataset.Manual collection')
  },
  [DatasetCollectionTypeEnum.apiFile]: {
    name: i18nT('common:core.dataset.apiFile')
  }
};

export enum DatasetCollectionSyncResultEnum {
  sameRaw = 'sameRaw',
  success = 'success'
}
export const DatasetCollectionSyncResultMap = {
  [DatasetCollectionSyncResultEnum.sameRaw]: {
    label: i18nT('common:core.dataset.collection.sync.result.sameRaw')
  },
  [DatasetCollectionSyncResultEnum.success]: {
    label: i18nT('common:core.dataset.collection.sync.result.success')
  }
};

/* ------------ data -------------- */

/* ------------ training -------------- */
export enum ImportDataSourceEnum {
  fileLocal = 'fileLocal',
  fileLink = 'fileLink',
  fileCustom = 'fileCustom',
  csvTable = 'csvTable',
  externalFile = 'externalFile',
  apiDataset = 'apiDataset',
  reTraining = 'reTraining'
}

export enum TrainingModeEnum {
  chunk = 'chunk',
  auto = 'auto',
  qa = 'qa'
}

export const TrainingTypeMap = {
  [TrainingModeEnum.chunk]: {
    label: i18nT('common:core.dataset.training.Chunk mode'),
    tooltip: i18nT('common:core.dataset.import.Chunk Split Tip'),
    openSource: true
  },
  [TrainingModeEnum.auto]: {
    label: i18nT('common:core.dataset.training.Auto mode'),
    tooltip: i18nT('common:core.dataset.training.Auto mode Tip'),
    openSource: false
  },
  [TrainingModeEnum.qa]: {
    label: i18nT('common:core.dataset.training.QA mode'),
    tooltip: i18nT('common:core.dataset.import.QA Import Tip'),
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
    title: i18nT('common:core.dataset.search.mode.embedding'),
    desc: i18nT('common:core.dataset.search.mode.embedding desc'),
    value: DatasetSearchModeEnum.embedding
  },
  [DatasetSearchModeEnum.fullTextRecall]: {
    icon: 'core/dataset/fullTextRecall',
    title: i18nT('common:core.dataset.search.mode.fullTextRecall'),
    desc: i18nT('common:core.dataset.search.mode.fullTextRecall desc'),
    value: DatasetSearchModeEnum.fullTextRecall
  },
  [DatasetSearchModeEnum.mixedRecall]: {
    icon: 'core/dataset/mixedRecall',
    title: i18nT('common:core.dataset.search.mode.mixedRecall'),
    desc: i18nT('common:core.dataset.search.mode.mixedRecall desc'),
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
    label: i18nT('common:core.dataset.search.score.embedding'),
    desc: i18nT('common:core.dataset.search.score.embedding desc'),
    showScore: true
  },
  [SearchScoreTypeEnum.fullText]: {
    label: i18nT('common:core.dataset.search.score.fullText'),
    desc: i18nT('common:core.dataset.search.score.fullText desc'),
    showScore: false
  },
  [SearchScoreTypeEnum.reRank]: {
    label: i18nT('common:core.dataset.search.score.reRank'),
    desc: i18nT('common:core.dataset.search.score.reRank desc'),
    showScore: true
  },
  [SearchScoreTypeEnum.rrf]: {
    label: i18nT('common:core.dataset.search.score.rrf'),
    desc: i18nT('common:core.dataset.search.score.rrf desc'),
    showScore: false
  }
};

export const CustomCollectionIcon = 'common/linkBlue';
export const LinkCollectionIcon = 'common/linkBlue';

/* source prefix */
export enum DatasetSourceReadTypeEnum {
  fileLocal = 'fileLocal',
  link = 'link',
  externalFile = 'externalFile',
  apiFile = 'apiFile',
  reTraining = 'reTraining'
}
