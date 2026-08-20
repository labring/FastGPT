import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../../schema';
import { decodeHttpToolSetNodesFromStorage } from '../../jsonSchemaStorage';

export const getHttpToolsets = ({
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
    .then((apps) => {
      let changed = false;
      const decodedApps = apps.map((app) => {
        const modules = decodeHttpToolSetNodesFromStorage(app.modules);
        if (modules === app.modules) return app;

        changed = true;
        return { ...app, modules };
      });

      return changed ? decodedApps : apps;
    });
};
