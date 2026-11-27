import {
  ChunkSettingModeEnum,
  ChunkTriggerConfigTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetSourceReadTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { IultmzhFileParseConfigType } from '@fastgpt/global/core/dataset/type';
import { urlsFetch } from '../../common/string/cheerio';
import { type TextSplitProps } from '../../common/string/textSplitter';
import { readFileContentBySource } from '../../common/file/read/utils';
import { getApiDatasetRequest } from './apiDataset';
import { chunkByIultmzh } from '../../thirdProvider/sangfor/chunk';
import { serviceEnv } from '../../env';
import Papa from 'papaparse';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { readRawContentFromSource, text2Chunks } from '../../worker/function';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getS3DatasetSource } from '../../common/s3/sources/dataset';
import { getFileS3Key, isS3ObjectKey } from '../../common/s3/utils';
import { isAuthorizedDatasetFileS3Key } from '../../common/s3/sources/dataset/key';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getBackendFileOperationTimeoutMs } from '../../common/file/parseTimeout';
import {
  createExternalHttpFileSource,
  resolveFileSourceDeclaredExtension,
  type FileSource
} from '../../common/file/read/source';
import { getTeamFileSizeLimitBytes } from '../../support/permission/fileLimit';

const datasetCsvColumnTypes = new Set(['q', 'a', 'index', 'indexes', 'metadata']);

/**
 * 解析知识库 CSV 表头，支持新版 q/a/index/metadata 和旧版 q/a/indexes 结构。
 * q、a 必须各出现一次，metadata 最多一列，index/indexes 可以重复。
 */
export const parseDatasetCsvHeaders = (headers: string[]) => {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const typedHeader =
    normalized.length > 0 && normalized.every((header) => datasetCsvColumnTypes.has(header));

  return {
    normalized,
    typedHeader,
    validTypedHeader:
      typedHeader &&
      normalized.filter((header) => header === 'q').length === 1 &&
      normalized.filter((header) => header === 'a').length === 1 &&
      normalized.filter((header) => header === 'metadata').length <= 1
  };
};

/**
 * 从 CSV 原文读取第一行表头，统一复用 PapaParse，避免 API 层用字符串 split 误判带引号的表头。
 */
export const getDatasetCsvHeaders = (rawText: string) => {
  const [headers = []] = Papa.parse(rawText).data as string[][];
  return headers;
};

export type DatasetImportTable = {
  chunks: ReturnType<typeof parseDatasetBackupRows>;
  rawTextLength: number;
};

/** 读取知识库单表，按原始列坐标映射知识块。 */
export const readDatasetXlsxTable = async (source: FileSource): Promise<DatasetImportTable> => {
  const { xlsxRows } = await readRawContentFromSource({ source, sparseXlsxRows: true });
  if (!xlsxRows) throw new Error('Missing structured XLSX import result');
  if (!parseDatasetCsvHeaders(Array.from(xlsxRows[0]?.values() ?? [])).validTypedHeader) {
    throw new Error('Invalid dataset import headers');
  }

  let rawTextLength = 0;
  for (const row of xlsxRows) {
    for (const value of row.values()) rawTextLength += value.length;
  }
  return { chunks: parseDatasetBackupRows({ rows: xlsxRows }), rawTextLength };
};

export const readFileRawTextByUrl = async ({
  teamId,
  tmbId,
  url,
  customPdfParse,
  sangforFileParseConfig,
  getFormatText,
  datasetId,
  usageId,
  maxSizeBytes
}: {
  teamId: string;
  tmbId: string;
  url: string;
  customPdfParse?: boolean;
  sangforFileParseConfig?: IultmzhFileParseConfigType;
  getFormatText?: boolean;
  relatedId: string; // externalFileId / apiFileId
  datasetId: string;
  usageId?: string;
  maxSizeBytes?: number;
}) => {
  const effectiveMaxSizeBytes = maxSizeBytes ?? (await getTeamFileSizeLimitBytes({ teamId }));
  const filename = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || undefined;
    } catch {
      return undefined;
    }
  })();
  const source = createExternalHttpFileSource({
    url,
    maxSizeBytes: effectiveMaxSizeBytes,
    timeoutMs: getBackendFileOperationTimeoutMs(),
    metadata: { filename }
  });
  const { fileParsedPrefix } = getFileS3Key.dataset({
    datasetId,
    filename: 'file'
  });
  const { rawText } = await retryFn(() =>
    readFileContentBySource({
      customPdfParse,
      sangforFileParseConfig,
      usageId,
      getFormatText,
      source,
      teamId,
      tmbId,
      imageKeyOptions: {
        // TODO: 链接解析出来的图片不过期，删除知识库时候也需要一起删
        prefix: fileParsedPrefix
      }
    })
  );

  return { rawText };
};

/*
  fileId - local file, read from mongo
  link - request
  externalFile/apiFile = request read
*/
export const readDatasetSourceRawText = async ({
  teamId,
  tmbId,
  type,
  sourceId,
  selector,
  externalFileId,
  apiDatasetServer,
  customPdfParse,
  sangforFileParseConfig,
  getFormatText,
  backupParse,
  usageId,
  datasetId
}: {
  teamId: string;
  tmbId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  customPdfParse?: boolean;
  /** 外部文档解析开关;建议传入 getDatasetIultmzhFileParseConfig(dataset) 补全后的完整配置 */
  sangforFileParseConfig?: IultmzhFileParseConfigType;
  getFormatText?: boolean;
  backupParse?: boolean;

  selector?: string; // link selector
  externalFileId?: string; // external file dataset
  apiDatasetServer?: ApiDatasetServerType; // api dataset
  usageId?: string;
  datasetId: string; // For S3 image upload
}): Promise<{
  title?: string;
  rawText: string;
  importedTable?: DatasetImportTable;
}> => {
  if (type === DatasetSourceReadTypeEnum.fileLocal) {
    if (!datasetId || !isS3ObjectKey(sourceId, 'dataset')) {
      return Promise.reject('datasetId is required for S3 files');
    }

    if (!isAuthorizedDatasetFileS3Key({ key: sourceId, datasetId })) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
    }

    const datasetSource = getS3DatasetSource();
    if (backupParse && /\.xlsx$/i.test(sourceId)) {
      const source = await datasetSource.getDatasetFileSource({ fileId: sourceId, datasetId });
      if (resolveFileSourceDeclaredExtension(source.metadata) === 'xlsx') {
        return {
          title: source.metadata.filename,
          rawText: '',
          importedTable: await readDatasetXlsxTable(source)
        };
      }
    }
    const { filename, rawText } = await datasetSource.getDatasetFileRawText({
      teamId,
      tmbId,
      fileId: sourceId,
      getFormatText,
      customPdfParse,
      sangforFileParseConfig,
      usageId,
      datasetId
    });

    return {
      title: filename,
      rawText
    };
  } else if (type === DatasetSourceReadTypeEnum.link) {
    const result = await urlsFetch({
      urlList: [sourceId],
      selector
    });

    const { title = sourceId, content = '' } = result[0];
    if (!content || content === 'Cannot fetch internal url') {
      return Promise.reject(content || 'Can not fetch content from link');
    }

    return {
      title,
      rawText: content
    };
  } else if (type === DatasetSourceReadTypeEnum.externalFile) {
    if (!externalFileId) return Promise.reject(new UserError('FileId not found'));
    const { rawText } = await readFileRawTextByUrl({
      teamId,
      tmbId,
      url: sourceId,
      relatedId: externalFileId,
      datasetId,
      customPdfParse,
      sangforFileParseConfig,
      usageId
    });
    return {
      rawText
    };
  } else if (type === DatasetSourceReadTypeEnum.apiFile) {
    const { title, rawText } = await readApiServerFileContent({
      apiDatasetServer,
      apiFileId: sourceId,
      teamId,
      tmbId,
      customPdfParse,
      sangforFileParseConfig,
      datasetId,
      usageId
    });
    return {
      title,
      rawText
    };
  }
  return {
    title: '',
    rawText: ''
  };
};

export const readApiServerFileContent = async ({
  apiDatasetServer,
  apiFileId,
  teamId,
  tmbId,
  customPdfParse,
  sangforFileParseConfig,
  datasetId,
  usageId
}: {
  apiDatasetServer?: ApiDatasetServerType;
  apiFileId: string;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  sangforFileParseConfig?: IultmzhFileParseConfigType;
  datasetId: string;
  usageId?: string;
}): Promise<{
  title?: string;
  rawText: string;
}> => {
  return (await getApiDatasetRequest(apiDatasetServer)).getFileContent({
    teamId,
    tmbId,
    apiFileId,
    customPdfParse,
    sangforFileParseConfig,
    datasetId,
    usageId
  });
};

type DatasetBackupRow = string[] | ReadonlyMap<number, string>;
type DatasetBackupChunk = {
  q: string;
  a: string;
  indexes: string[];
  metadata?: Record<string, unknown>;
  imageIdList?: string[];
};

/** 将旧 CSV 行或按坐标读取的 XLSX 行映射成同一套问答、索引与元数据。 */
export const parseDatasetBackupRows = ({
  rows,
  imageIdList
}: {
  rows: DatasetBackupRow[];
  imageIdList?: string[];
}): DatasetBackupChunk[] => {
  if (rows.length < 2) return [];

  const [header, ...data] = rows;
  const headerEntries = [...header.entries()].sort(([a], [b]) => a - b);
  const { normalized, typedHeader } = parseDatasetCsvHeaders(
    headerEntries.map(([, value]) => value)
  );
  let qIdx = -1;
  let aIdx = -1;
  const indexColumns = new Set<number>();
  const metadataKeys: { idx: number; key: string }[] = [];
  const metadataColumns: number[] = [];

  for (const [offset, name] of normalized.entries()) {
    const [column, label] = headerEntries[offset];
    if (name === 'q') {
      qIdx = column;
    } else if (name === 'a') {
      aIdx = column;
    } else if (name === 'index' || name === 'indexes') {
      indexColumns.add(column);
    } else if (typedHeader && name === 'metadata') {
      metadataColumns.push(column);
    } else {
      metadataKeys.push({ idx: column, key: label.trim() });
    }
  }

  // 旧格式可以只有一个 indexes 表头，实际索引值延伸至行尾。
  const legacyIndexesStart =
    metadataKeys.length === 0 && metadataColumns.length === 0 && indexColumns.size === 1
      ? [...indexColumns][0]
      : undefined;
  const isIndexColumn = (column: number) =>
    legacyIndexesStart === undefined ? indexColumns.has(column) : column >= legacyIndexesStart;
  const declaredColumns = new Set(headerEntries.map(([column]) => column));

  return data
    .map((row) => {
      const sparse = !Array.isArray(row);
      const cellText = (column: number) => (sparse ? row.get(column) : row[column]) ?? '';
      const indexEntries: [number, string][] = [];
      for (const [column, value] of row.entries()) {
        if (isIndexColumn(column)) {
          const text = value.trim();
          if (text) indexEntries.push([column, text]);
        } else if (sparse && !declaredColumns.has(column)) {
          throw new Error('XLSX dataset import has data in a column without a header');
        }
      }
      const indexes = indexEntries.sort(([a], [b]) => a - b).map(([, value]) => value);

      let metadata: Record<string, unknown> | undefined;
      for (const { idx, key } of metadataKeys) {
        const value = cellText(idx).trim();
        if (value) metadata = { ...metadata, [key]: value };
      }
      for (const column of metadataColumns) {
        const value = cellText(column).trim();
        if (!value) continue;

        let parsedValue: unknown;
        try {
          parsedValue = JSON.parse(value);
        } catch {}
        // 固定 metadata 表头没有字段名，非法 JSON 按列序保存原文。
        metadata =
          parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
            ? { ...metadata, ...parsedValue }
            : { ...metadata, [`metadata_${column - headerEntries[0][0]}`]: value };
      }

      return {
        q: cellText(qIdx),
        a: cellText(aIdx),
        indexes,
        metadata,
        imageIdList
      };
    })
    .filter(({ q, a }) => q || a);
};

export const rawText2Chunks = async ({
  rawText = '',
  chunkTriggerType = ChunkTriggerConfigTypeEnum.minSize,
  chunkTriggerMinSize = 1000,
  backupParse,
  chunkSize = 512,
  imageIdList,
  chunkSettingMode,
  trainingType,
  ...splitProps
}: {
  rawText: string;
  imageIdList?: string[];

  chunkTriggerType?: ChunkTriggerConfigTypeEnum;
  chunkTriggerMinSize?: number; // maxSize from agent model, not store

  backupParse?: boolean;
  tableParse?: boolean;
  // chunkSettingMode=intelligent 且训练类型为 chunk 时,「文本→chunk」委托给外部智能分块服务
  chunkSettingMode?: ChunkSettingModeEnum;
  trainingType?: DatasetCollectionDataProcessModeEnum;
} & TextSplitProps): Promise<
  {
    q: string;
    a: string;
    indexes?: string[];
    metadata?: Record<string, any>;
    imageIdList?: string[];
  }[]
> => {
  if (backupParse) {
    const { data } = Papa.parse<string[]>(rawText, { skipEmptyLines: 'greedy' });
    return parseDatasetBackupRows({ rows: data, imageIdList });
  }

  // Chunk condition
  // 1. 选择最大值条件，只有超过了最大值(默认为模型的最大值*0.7），才会触发分块
  if (chunkTriggerType === ChunkTriggerConfigTypeEnum.maxSize) {
    const textLength = rawText.trim().length;
    const maxSize = splitProps.maxSize ? splitProps.maxSize * 0.7 : 16000;
    if (textLength < maxSize) {
      return [
        {
          q: rawText,
          a: '',
          imageIdList
        }
      ];
    }
  }
  // 2. 选择最小值条件，只有超过最小值(手动决定)才会触发分块
  if (chunkTriggerType !== ChunkTriggerConfigTypeEnum.forceChunk) {
    const textLength = rawText.trim().length;
    if (textLength < chunkTriggerMinSize) {
      return [{ q: rawText, a: '', imageIdList }];
    }
  }

  // 智能分块: chunkSettingMode=intelligent 且训练类型为 chunk 时,把「文本→chunk」委托给 sangfor 智能分块服务。
  // 未配置服务地址、请求失败、响应异常都由 chunkByIultmzh 抛错,不静默回退本地分块。
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    chunkSettingMode === ChunkSettingModeEnum.intelligent
  ) {
    return chunkByIultmzh({
      text: rawText,
      imageIdList,
      url: serviceEnv.SANGFOR_CHUNK_URL,
      key: serviceEnv.SANGFOR_CHUNK_KEY,
      chunkSize,
      timeoutMs: serviceEnv.SANGFOR_CHUNK_TIMEOUT_MINUTES * 60 * 1000
    });
  }

  const { chunks } = await text2Chunks({
    text: rawText,
    chunkSize,
    ...splitProps
  });

  return chunks.map((item) => ({
    q: item,
    a: '',
    indexes: [],
    imageIdList
  }));
};
