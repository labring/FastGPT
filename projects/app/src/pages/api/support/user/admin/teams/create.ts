import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
// import { connectToDatabase } from '@/service/mongo';
import { startSession, type ClientSession } from 'mongoose';

export type CreateTeamBody = {
  name: string;
  ownerId: string;
  avatar?: string;
  description?: string;
  memberIds?: string[]; // 要添加的成员ID列表
  memberRoles?: { [userId: string]: `${TeamMemberRoleEnum}` }; // 每个成员的角色
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  // 提取请求参数到外层作用域
  const {
    name,
    ownerId,
    avatar = '/icon/logo.svg',
    description = '',
    memberIds = [],
    memberRoles = {}
  } = req.body as CreateTeamBody;

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 验证必填字段
    if (!name || !ownerId) {
      return jsonRes(res, {
        code: 400,
        message: '团队名称和所有者ID是必填项'
      });
    }

    // 验证所有者是否存在
    const owner = await MongoUser.findById(ownerId);
    if (!owner) {
      return jsonRes(res, {
        code: 400,
        message: '指定的所有者不存在'
      });
    }

    // 验证成员是否存在
    if (memberIds.length > 0) {
      const members = await MongoUser.find({ _id: { $in: memberIds } });
      if (members.length !== memberIds.length) {
        return jsonRes(res, {
          code: 400,
          message: '部分指定的成员不存在'
        });
      }
    }

    // 检查团队名称是否已存在
    const existingTeam = await MongoTeam.findOne({ name });
    if (existingTeam) {
      return jsonRes(res, {
        code: 400,
        message: '团队名称已存在'
      });
    }

    // 尝试使用事务创建团队
    let session: ClientSession | null = null;
    try {
      session = (await Promise.race([
        startSession(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session start timeout')), 5000)
        )
      ])) as ClientSession;

      if (!session) {
        throw new Error('Failed to create session');
      }

      await session.withTransaction(async () => {
        // 创建团队
        const [newTeam] = await MongoTeam.create(
          [
            {
              name,
              ownerId,
              avatar,
              createTime: new Date(),
              balance: 0,
              teamDomain: '',
              limit: {
                lastExportDatasetTime: new Date('2000-01-01'),
                lastWebsiteSyncTime: new Date('2000-01-01')
              }
            }
          ],
          { session: session! }
        );

        // 添加所有者为管理员
        await MongoTeamMember.create(
          [
            {
              teamId: newTeam._id,
              userId: ownerId,
              name: owner.username,
              role: TeamMemberRoleEnum.owner,
              status: TeamMemberStatusEnum.active,
              createTime: new Date(),
              defaultTeam: false
            }
          ],
          { session: session! }
        );

        // 添加其他成员
        if (memberIds.length > 0) {
          const memberDocs = await MongoUser.find({ _id: { $in: memberIds } }, null, {
            session: session!
          });
          const teamMembers = memberDocs.map((member) => ({
            teamId: newTeam._id,
            userId: member._id,
            name: member.username,
            role: memberRoles[member._id.toString()] || TeamMemberRoleEnum.member,
            status: TeamMemberStatusEnum.active,
            createTime: new Date(),
            defaultTeam: false
          }));

          await MongoTeamMember.create(teamMembers, { session: session! });
        }

        return jsonRes(res, {
          data: {
            teamId: newTeam._id,
            name: newTeam.name,
            ownerId: newTeam.ownerId,
            memberCount: 1 + memberIds.length
          }
        });
      });
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch (e) {
          console.warn('Failed to end session:', e);
        }
      }
    }
  } catch (err: any) {
    console.error('Create team error:', err);

    // 如果是超时错误，尝试不使用事务的简单创建方式
    if (err.message?.includes('timeout') || err.message?.includes('Session start timeout')) {
      console.log('Transaction failed, trying simple creation...');
      try {
        // 简单创建团队（不使用事务）
        const newTeam = await MongoTeam.create({
          name,
          ownerId,
          avatar,
          createTime: new Date(),
          balance: 0,
          teamDomain: '',
          limit: {
            lastExportDatasetTime: new Date('2000-01-01'),
            lastWebsiteSyncTime: new Date('2000-01-01')
          }
        });

        // 添加所有者为管理员
        const owner = await MongoUser.findById(ownerId);
        await MongoTeamMember.create({
          teamId: newTeam._id,
          userId: ownerId,
          name: owner?.username || 'Unknown',
          role: TeamMemberRoleEnum.owner,
          status: TeamMemberStatusEnum.active,
          createTime: new Date(),
          defaultTeam: false
        });

        return jsonRes(res, {
          data: {
            teamId: newTeam._id,
            name: newTeam.name,
            ownerId: newTeam.ownerId,
            memberCount: 1
          }
        });
      } catch (simpleErr: any) {
        console.error('Simple team creation also failed:', simpleErr);
        return jsonRes(res, {
          code: 500,
          message: '创建团队失败',
          error: process.env.NODE_ENV === 'development' ? simpleErr.message : undefined
        });
      }
    }

    // 根据错误类型返回不同的错误信息
    let errorMessage = '创建团队失败';
    if (err.message?.includes('duplicate')) {
      errorMessage = '团队名称已存在';
    } else if (err.message?.includes('validation')) {
      errorMessage = '数据验证失败';
    }

    return jsonRes(res, {
      code: 500,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

export default handler;
