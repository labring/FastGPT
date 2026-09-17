import { MongoApp } from '../../schema';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';

export const getMcpToolsets = async ({
  teamId,
  ids,
  field
}: {
  teamId: string;
  ids: string[];
  field?: Record<string, boolean>;
}): Promise<AppSchemaType[]> => {
  const apps = await MongoApp.find(
    { teamId, _id: { $in: ids } },
    field ? { ...field, publishedVersionId: true } : undefined
  ).lean();
  return apps;
};
