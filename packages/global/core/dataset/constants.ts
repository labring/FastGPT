import { i18nT } from '../../../web/i18n/utils';

/* ------------ dataset -------------- */
export enum DatasetTypeEnum {
  folder = 'folder',
  dataset = 'dataset',
  websiteDataset = 'websiteDataset', // depp link
  externalFile = 'externalFile',

  apiDataset = 'apiDataset',
  feishu = 'feishu',
  yuque = 'yuque'
}

// @ts-ignore
export const ApiDatasetTypeMap: Record<
  `${DatasetTypeEnum}`,
  {
    icon: string;
    avatar: string;
    label: any;
    collectionLabel: string;
    courseUrl?: string;
  }
> = {
  [DatasetTypeEnum.apiDataset]: {
    icon: 'core/dataset/externalDatasetOutline',
    avatar: 'core/dataset/externalDatasetColor',
    label: i18nT('dataset:api_file'),
    collectionLabel: i18nT('common:File'),
    courseUrl: '/docs/introduction/guide/knowledge_base/api_dataset/'
  },
  [DatasetTypeEnum.feishu]: {
    icon: 'core/dataset/feishuDatasetOutline',
    avatar: 'core/dataset/feishuDatasetColor',
    label: i18nT('dataset:feishu_dataset'),
    collectionLabel: i18nT('common:File'),
    courseUrl: '/docs/introduction/guide/knowledge_base/lark_dataset/'
  },
  [DatasetTypeEnum.yuque]: {
    icon: 'core/dataset/yuqueDatasetOutline',
    avatar: 'core/dataset/yuqueDatasetColor',
    label: i18nT('dataset:yuque_dataset'),
    collectionLabel: i18nT('common:File'),
    courseUrl: '/docs/introduction/guide/knowledge_base/yuque_dataset/'
  }
};
export const DatasetTypeMap: Record<
  `${DatasetTypeEnum}`,
  {
    icon: string;
    avatar: string;
    label: any;
    collectionLabel: string;
    courseUrl?: string;
  }
> = {
  ...ApiDatasetTypeMap,
  [DatasetTypeEnum.folder]: {
    icon: 'common/folderFill',
    avatar: 'common/folderFill',
    label: i18nT('dataset:folder_dataset'),
    collectionLabel: i18nT('common:Folder')
  },
  [DatasetTypeEnum.dataset]: {
    icon: 'core/dataset/commonDatasetOutline',
    avatar: 'core/dataset/commonDatasetColor',
    label: i18nT('dataset:common_dataset'),
    collectionLabel: i18nT('common:File')
  },
  [DatasetTypeEnum.websiteDataset]: {
    icon: 'core/dataset/websiteDatasetOutline',
    avatar: 'core/dataset/websiteDatasetColor',
    label: i18nT('dataset:website_dataset'),
    collectionLabel: i18nT('common:Website'),
    courseUrl: '/docs/introduction/guide/knowledge_base/websync/'
  },
  [DatasetTypeEnum.externalFile]: {
    icon: 'core/dataset/externalDatasetOutline',
    avatar: 'core/dataset/externalDatasetColor',
    label: i18nT('dataset:external_file'),
    collectionLabel: i18nT('common:File')
  }
};

export enum DatasetStatusEnum {
  active = 'active',
  syncing = 'syncing',
  waiting = 'waiting',
  error = 'error'
}
export const DatasetStatusMap = {
  [DatasetStatusEnum.active]: {
    label: i18nT('common:core.dataset.status.active')
  },
  [DatasetStatusEnum.syncing]: {
    label: i18nT('common:core.dataset.status.syncing')
  },
  [DatasetStatusEnum.waiting]: {
    label: i18nT('common:core.dataset.status.waiting')
  },
  [DatasetStatusEnum.error]: {
    label: i18nT('dataset:status_error')
  }
};

/* ------------ collection -------------- */
export enum DatasetCollectionTypeEnum {
  folder = 'folder',
  virtual = 'virtual',

  file = 'file', // file
  link = 'link', // link
  manual = 'manual', // manual input
  apiFile = 'apiFile', // apiDatasetFile, not store mongo file
  externalFile = 'externalFile', // external file, not store mongo file
  images = 'images' // images collection
}

// 新增：表格处理配置
export const TABLE_PROCESSING_CONFIG = {
  // 表格识别阈值：如果80%以上的行都是表格格式，认为是表格
  TABLE_RECOGNITION_THRESHOLD: 0.8,

  // 表格合并最大间隔：表格片段之间最多允许多少个空行
  MAX_TABLE_MERGE_GAP: 2,

  // 表格最大列数限制
  MAX_TABLE_COLUMNS: 20,

  // 表格最小行数：少于这个数量的行不认为是表格
  MIN_TABLE_ROWS: 2,

  // 跨页表格合并：是否启用跨页表格合并功能
  ENABLE_CROSS_PAGE_TABLE_MERGE: true,

  // 表格修复：是否启用表格修复功能（自动添加表头、分隔符等）
  ENABLE_TABLE_REPAIR: true,

  // 智能表格识别：是否启用基于内容的智能表格识别
  ENABLE_SMART_TABLE_DETECTION: true
} as const;

// 表格处理策略
export enum TableProcessingStrategyEnum {
  NONE = 'none', // 不进行特殊处理
  BASIC = 'basic', // 基础表格处理
  ENHANCED = 'enhanced', // 增强表格处理（包含跨页合并）
  SMART = 'smart' // 智能表格处理（AI辅助识别）
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
    name: i18nT('dataset:empty_collection')
  },
  [DatasetCollectionTypeEnum.apiFile]: {
    name: i18nT('common:core.dataset.apiFile')
  },
  [DatasetCollectionTypeEnum.images]: {
    name: i18nT('dataset:core.dataset.Image collection')
  }
};

export enum DatasetCollectionSyncResultEnum {
  sameRaw = 'sameRaw',
  success = 'success',
  failed = 'failed'
}
export const DatasetCollectionSyncResultMap = {
  [DatasetCollectionSyncResultEnum.sameRaw]: {
    label: i18nT('common:core.dataset.collection.sync.result.sameRaw')
  },
  [DatasetCollectionSyncResultEnum.success]: {
    label: i18nT('common:core.dataset.collection.sync.result.success')
  },
  [DatasetCollectionSyncResultEnum.failed]: {
    label: i18nT('dataset:sync_collection_failed')
  }
};

export enum DatasetCollectionDataProcessModeEnum {
  chunk = 'chunk',
  qa = 'qa',
  imageParse = 'imageParse',

  backup = 'backup',
  template = 'template',

  auto = 'auto' // abandon
}
export const DatasetCollectionDataProcessModeMap = {
  [DatasetCollectionDataProcessModeEnum.chunk]: {
    label: i18nT('common:core.dataset.training.Chunk mode'),
    tooltip: i18nT('common:core.dataset.import.Chunk Split Tip')
  },
  [DatasetCollectionDataProcessModeEnum.qa]: {
    label: i18nT('common:core.dataset.training.QA mode'),
    tooltip: i18nT('common:core.dataset.import.QA Import Tip')
  },
  [DatasetCollectionDataProcessModeEnum.imageParse]: {
    label: i18nT('dataset:training.Image mode'),
    tooltip: i18nT('common:core.dataset.import.Chunk Split Tip')
  },
  [DatasetCollectionDataProcessModeEnum.auto]: {
    label: i18nT('common:core.dataset.training.Auto mode'),
    tooltip: i18nT('common:core.dataset.training.Auto mode Tip')
  },

  [DatasetCollectionDataProcessModeEnum.backup]: {
    label: i18nT('dataset:backup_mode'),
    tooltip: i18nT('dataset:backup_mode')
  },
  [DatasetCollectionDataProcessModeEnum.template]: {
    label: i18nT('dataset:template_mode'),
    tooltip: i18nT('dataset:template_mode')
  }
};

export enum ChunkTriggerConfigTypeEnum {
  minSize = 'minSize',
  forceChunk = 'forceChunk',
  maxSize = 'maxSize'
}
export enum ChunkSettingModeEnum {
  auto = 'auto',
  custom = 'custom'
}

export enum DataChunkSplitModeEnum {
  paragraph = 'paragraph',
  size = 'size',
  char = 'char'
}
export enum ParagraphChunkAIModeEnum {
  auto = 'auto',
  force = 'force',
  forbid = 'forbid'
}

/* ------------ data -------------- */

/* ------------ training -------------- */
export enum ImportDataSourceEnum {
  fileLocal = 'fileLocal',
  fileLink = 'fileLink',
  fileCustom = 'fileCustom',
  externalFile = 'externalFile',
  apiDataset = 'apiDataset',
  reTraining = 'reTraining',
  imageDataset = 'imageDataset'
}

export enum TrainingModeEnum {
  parse = 'parse',
  chunk = 'chunk',
  qa = 'qa',
  auto = 'auto',
  image = 'image',
  imageParse = 'imageParse'
}

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
    label: i18nT('common:core.dataset.search.mode.embedding'),
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
