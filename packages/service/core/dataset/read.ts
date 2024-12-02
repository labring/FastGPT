import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readFileContentFromMongo } from '../../common/file/gridfs/controller';
import { urlsFetch } from '../../common/string/cheerio';
import { parseCsvTable2Chunks } from './training/utils';
import { TextSplitProps, splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import axios from 'axios';
import { readRawContentByFileBuffer } from '../../common/file/read/utils';
import { getNanoid, parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { MongoDataset } from './schema';
import { APIFileContentResponse } from '@fastgpt/global/core/dataset/apiDataset';

export const readFileRawTextByUrl = async ({
  teamId,
  url,
  relatedId
}: {
  teamId: string;
  url: string;
  relatedId?: string;
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
    externalFile = request read
*/
export const readDatasetSourceRawText = async ({
  teamId,
  type,
  sourceId,
  isQAImport,
  selector,
  relatedId,
  datasetId
}: {
  teamId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  isQAImport?: boolean;
  selector?: string;
  relatedId?: string;
  datasetId?: string;
}): Promise<string> => {
  const dataset = await MongoDataset.findById(datasetId);

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
    const rawText = await readFileRawTextByUrl({
      teamId,
      url: sourceId,
      relatedId
    });
    return rawText;
  } else if (type === DatasetSourceReadTypeEnum.apiFile) {
    const apiServer = dataset?.apiServer;
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
  apiServer: {
    baseUrl: string;
    authorization: string;
  };
  apiFileId: string;
  teamId: string;
}) => {
  const { baseUrl, authorization } = apiServer;
  const { data } = await axios.get<APIFileContentResponse>(
    `${baseUrl}/v1/file/content?id=${apiFileId}`,
    {
      headers: { Authorization: authorization }
    }
  );
  const { content, previewUrl } = data.data;
  if (content) {
    return content;
  } else if (previewUrl) {
    const rawText = await readFileRawTextByUrl({
      teamId,
      url: previewUrl,
      relatedId: getNanoid(24)
    });
    return rawText;
  } else {
    return Promise.reject('Invalid content type: content or previewUrl is required');
  }
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
