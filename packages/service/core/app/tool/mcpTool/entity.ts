import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../../schema';

export const getMcpToolsets = ({
  teamId,
  ids,
  field
}: {
  teamId: string;
  ids: string[];
  field?: Record<string, boolean>;
}): Promise<AppSchemaType[]> => {
  return MongoApp.find({ teamId, _id: { $in: ids } }, field).lean();
};
