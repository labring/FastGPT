import type { NextApiRequest } from 'next';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type.d';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';

/* get all dataset tags by datasetId */
async function handler(req: NextApiRequest): Promise<DatasetTagType[]> {
  const { datasetId } = req.query;
  const allDatasetTags = await MongoDatasetCollectionTags.find({ datasetId }).lean();
  if (!allDatasetTags) {
    return [];
  }
  const tags = allDatasetTags.map((tag) => ({
    _id: tag._id,
    tag: tag.tag
  }));
  return tags;
}

export default NextAPI(handler);
