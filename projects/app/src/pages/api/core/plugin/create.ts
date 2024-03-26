import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/plugin/httpPlugin/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });
    const body = req.body as CreateOnePluginParams;

    // await checkTeamPluginLimit(teamId);

    // create parent plugin and child plugin
    if (body.metadata?.apiSchemaStr) {
      const parentId = await mongoSessionRun(async (session) => {
        const [{ _id: parentId }] = await MongoPlugin.create(
          [
            {
              ...body,
              parentId: null,
              teamId,
              tmbId
            }
          ],
          { session }
        );

        const childrenPlugins = await httpApiSchema2Plugins({
          parentId,
          apiSchemaStr: body.metadata?.apiSchemaStr,
          customHeader: body.metadata?.customHeaders
        });

        await MongoPlugin.create(
          childrenPlugins.map((item) => ({
            ...item,
            metadata: {
              pluginUid: item.name
            },
            teamId,
            tmbId
          })),
          {
            session
          }
        );
        return parentId;
      });

      jsonRes(res, {
        data: parentId
      });
    } else {
      const { _id } = await MongoPlugin.create({
        ...body,
        teamId,
        tmbId
      });
      jsonRes(res, {
        data: _id
      });
    }
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
