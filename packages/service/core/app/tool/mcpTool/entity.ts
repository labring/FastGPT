import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../../schema';
import { decodeMcpToolSetNodesFromStorage } from '../../jsonSchemaStorage';

export const getMcpToolsets = ({
  teamId,
  ids,
  field
}: {
  teamId: string;
  ids: string[];
  field?: Record<string, boolean>;
}): Promise<AppSchemaType[]> => {
  return MongoApp.find({ teamId, _id: { $in: ids } }, field)
    .lean()
    .then((apps) =>
      apps.map((app) => ({
        ...app,
        modules: decodeMcpToolSetNodesFromStorage(app.modules)
      }))
    );
};
