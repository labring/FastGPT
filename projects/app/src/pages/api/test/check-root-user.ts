import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 检查是否存在 root 用户
    const rootUser = await MongoUser.findOne({ username: 'root' });

    if (rootUser) {
      // 检查 root 用户的团队信息
      const rootTeam = await MongoTeam.findOne({ ownerId: rootUser._id });
      const rootTeamMember = await MongoTeamMember.findOne({ userId: rootUser._id });

      return jsonRes(res, {
        data: {
          message: 'Root user exists',
          rootUser: {
            _id: rootUser._id,
            username: rootUser.username,
            status: rootUser.status,
            createTime: rootUser.createTime,
            timezone: rootUser.timezone
          },
          rootTeam: rootTeam
            ? {
                _id: rootTeam._id,
                name: rootTeam.name,
                ownerId: rootTeam.ownerId
              }
            : null,
          rootTeamMember: rootTeamMember
            ? {
                _id: rootTeamMember._id,
                teamId: rootTeamMember.teamId,
                userId: rootTeamMember.userId,
                role: rootTeamMember.role,
                status: rootTeamMember.status
              }
            : null,
          canCreateRoot: false
        }
      });
    }

    // 如果是 POST 请求且 root 用户不存在，则创建
    if (req.method === 'POST') {
      const password = process.env.DEFAULT_ROOT_PSW || '123456';

      let rootId = '';

      await mongoSessionRun(async (session) => {
        // 创建 root 用户
        const [newRootUser] = await MongoUser.create(
          [
            {
              username: 'root',
              password: hashStr(password)
            }
          ],
          { session, ordered: true }
        );
        rootId = newRootUser._id;

        // 创建默认团队
        await createDefaultTeam({ userId: rootId, session });
      });

      const createdUser = await MongoUser.findById(rootId);
      const createdTeam = await MongoTeam.findOne({ ownerId: rootId });
      const createdTeamMember = await MongoTeamMember.findOne({ userId: rootId });

      return jsonRes(res, {
        data: {
          message: 'Root user created successfully',
          password,
          rootUser: {
            _id: createdUser?._id,
            username: createdUser?.username,
            status: createdUser?.status,
            createTime: createdUser?.createTime
          },
          rootTeam: createdTeam
            ? {
                _id: createdTeam._id,
                name: createdTeam.name,
                ownerId: createdTeam.ownerId
              }
            : null,
          rootTeamMember: createdTeamMember
            ? {
                _id: createdTeamMember._id,
                teamId: createdTeamMember.teamId,
                userId: createdTeamMember.userId,
                role: createdTeamMember.role,
                status: createdTeamMember.status
              }
            : null
        }
      });
    }

    // GET 请求且 root 用户不存在
    return jsonRes(res, {
      data: {
        message: 'Root user does not exist',
        rootUser: null,
        rootTeam: null,
        rootTeamMember: null,
        canCreateRoot: true,
        defaultPassword: process.env.DEFAULT_ROOT_PSW || '123456'
      }
    });
  } catch (err: any) {
    console.error('Check root user error:', err);
    return jsonRes(res, {
      code: 500,
      error: {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack
      }
    });
  }
}

export default handler;
