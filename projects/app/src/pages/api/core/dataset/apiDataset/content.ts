import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import axios from 'axios';

export type GetApiDatasetFileContentProps = {
  fileIds: string[];
  apiServer: {
    baseUrl: string;
    authorization: string;
  };
};

export type GetApiDatasetFileContentResponse = {
  fileId: string;
  content: string;
  previewUrl: string;
  rawLink: string;
}[];

async function handler(req: ApiRequestProps<GetApiDatasetFileContentProps>) {
  const { fileIds, apiServer } = req.body;

  const { baseUrl, authorization } = apiServer;

  const results = await Promise.all(
    fileIds.map(async (fileId) => {
      const [contentRes, readRes] = await Promise.all([
        axios.get(`${baseUrl}/v1/file/content?id=${fileId}`, {
          headers: { Authorization: authorization }
        }),
        axios.get(`${baseUrl}/v1/file/read?id=${fileId}`, {
          headers: { Authorization: authorization }
        })
      ]);
      return {
        ...contentRes.data.data,
        fileId,
        rawLink: readRes.data.data.url
      };
    })
  );

  return results;
}

export default NextAPI(handler);
