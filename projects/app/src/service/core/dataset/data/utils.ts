import { APIFileServer } from '@/global/core/dataset/apiDataset';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import axios from 'axios';

/**
 * Same value judgment
 */
export async function hasSameValue({
  teamId,
  datasetId,
  collectionId,
  q,
  a = ''
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  q: string;
  a?: string;
}) {
  const count = await MongoDatasetData.countDocuments({
    teamId,
    datasetId,
    collectionId,
    q,
    a
  });

  if (count > 0) {
    return Promise.reject('已经存在完全一致的数据');
  }
}

type ApiContentResponse = {
  data: {
    content?: string;
    previewUrl?: string;
  };
};

type ApiContentResult = {
  isTextMode: boolean;
  content: string;
};

export async function fetchApiServerContent(
  apiServer: APIFileServer,
  apiFileId: string
): Promise<ApiContentResult> {
  const { baseUrl, authorization } = apiServer;
  const contentRes = await axios.get<ApiContentResponse>(
    `${baseUrl}/v1/file/content?id=${apiFileId}`,
    {
      headers: { Authorization: authorization }
    }
  );

  const content = contentRes.data.data;

  if (content.content) {
    return {
      isTextMode: true,
      content: content.content
    };
  } else if (content.previewUrl) {
    return {
      isTextMode: false,
      content: content.previewUrl
    };
  } else {
    throw new Error('Invalid content type: content or previewUrl is required');
  }
}
