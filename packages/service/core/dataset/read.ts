import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readFileContentFromMongo } from '../../common/file/gridfs/controller';
import { urlsFetch } from '../../common/string/cheerio';
import { parseCsvTable2Chunks } from './training/utils';
import { TextSplitProps, splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import axios from 'axios';
import { readRawContentByFileBuffer } from '../../common/file/read/utils';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { APIFileServer } from '@fastgpt/global/core/dataset/apiDataset';
import { useApiDatasetRequest } from './apiDataset/api';

export const readFileRawTextByUrl = async ({
  teamId,
  url,
  relatedId
}: {
  teamId: string;
  url: string;
  relatedId: string; // externalFileId / apiFileId
}) => {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'arraybuffer'
  });
  const extension = parseFileExtensionFromUrl(url);

  const buffer = Buffer.from(response.data, 'binary');

  const { rawText } = await readRawContentByFileBuffer({
    extension,
    teamId,
    buffer,
    encoding: 'utf-8',
    metadata: {
      relatedId
    }
  });

  return rawText;
};

/* 
  fileId - local file, read from mongo
  link - request
  externalFile/apiFile = request read
*/
export const readDatasetSourceRawText = async ({
  teamId,
  type,
  sourceId,
  isQAImport,
  selector,
  externalFileId,
  apiServer
}: {
  teamId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;

  isQAImport?: boolean; // csv data
  selector?: string; // link selector
  externalFileId?: string; // external file dataset
  apiServer?: APIFileServer; // api dataset
}): Promise<string> => {
  if (type === DatasetSourceReadTypeEnum.fileLocal) {
    const { rawText } = await readFileContentFromMongo({
      teamId,
      bucketName: BucketNameEnum.dataset,
      fileId: sourceId,
      isQAImport
    });
    return rawText;
  } else if (type === DatasetSourceReadTypeEnum.link) {
    const result = await urlsFetch({
      urlList: [sourceId],
      selector
    });

    return result[0]?.content || '';
  } else if (type === DatasetSourceReadTypeEnum.externalFile) {
    if (!externalFileId) return Promise.reject('FileId not found');
    const rawText = await readFileRawTextByUrl({
      teamId,
      url: sourceId,
      relatedId: externalFileId
    });
    return rawText;
  } else if (type === DatasetSourceReadTypeEnum.apiFile) {
    if (!apiServer) return Promise.reject('apiServer not found');
    const rawText = await readApiServerFileContent({
      apiServer,
      apiFileId: sourceId,
      teamId
    });
    return rawText;
  }

  return '';
};

export const readApiServerFileContent = async ({
  apiServer,
  apiFileId,
  teamId
}: {
  apiServer: APIFileServer;
  apiFileId: string;
  teamId: string;
}) => {
  return useApiDatasetRequest({ apiServer }).getFileContent({ teamId, apiFileId });
};

export const rawText2Chunks = ({
  rawText,
  isQAImport,
  chunkLen = 512,
  ...splitProps
}: {
  rawText: string;
  isQAImport?: boolean;
} & TextSplitProps) => {
  if (isQAImport) {
    const { chunks } = parseCsvTable2Chunks(rawText);
    return chunks;
  }

  const { chunks } = splitText2Chunks({
    text: rawText,
    chunkLen,
    ...splitProps
  });

  return chunks.map((item) => ({
    q: item,
    a: ''
  }));
};
