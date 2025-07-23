import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { startSession, type ClientSession } from 'mongoose';
// import { connectToDatabase } from '@/service/mongo';

export type CreateUserBody = {
  username: string;
  password: string;
  status?: `${UserStatusEnum}`;
  timezone?: string;
  promotionRate?: number;
  teamIds?: string[]; // 要加入的团队ID列表
  teamRoles?: { [teamId: string]: `${TeamMemberRoleEnum}` }; // 每个团队的角色
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  // 提取请求参数到外层作用域
  const {
    username,
    password,
    status = UserStatusEnum.active,
    timezone = 'Asia/Shanghai',
    promotionRate = 0,
    teamIds = [],
    teamRoles = {}
  } = req.body as CreateUserBody;

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 验证必填字段
    if (!username || !password) {
      return jsonRes(res, {
        code: 400,
        message: 'Username and password are required'
      });
    }

    // 检查用户名是否已存在
    const existingUser = await MongoUser.findOne({ username });
    if (existingUser) {
      return jsonRes(res, {
        code: 400,
        message: 'Username already exists'
      });
    }

    // 验证团队是否存在
    if (teamIds.length > 0) {
      const teams = await MongoTeam.find({ _id: { $in: teamIds } });
      if (teams.length !== teamIds.length) {
        return jsonRes(res, {
          code: 400,
          message: 'Some teams do not exist'
        });
      }
    }

    // 尝试使用事务，如果失败则使用简单方式
    let useTransaction = true;
    let session: ClientSession | null = null;

    try {
      // 启动会话，设置较短的超时时间
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
        // 创建用户
        const [newUser] = await MongoUser.create(
          [
            {
              username,
              password: hashStr(password),
              status,
              timezone,
              promotionRate,
              createTime: new Date()
            }
          ],
          { session }
        );

        // 为用户创建默认团队
        await createDefaultTeam({
          userId: newUser._id,
          teamName: `${username}'s Team`,
          session: session!
        });

        // 将用户加入指定的团队
        if (teamIds.length > 0) {
          const teamMemberData = teamIds.map((teamId) => ({
            teamId,
            userId: newUser._id,
            name: username,
            role: teamRoles[teamId] || TeamMemberRoleEnum.member,
            status: TeamMemberStatusEnum.active,
            createTime: new Date()
          }));

          await MongoTeamMember.create(teamMemberData, { session: session! });
        }

        return jsonRes(res, {
          data: {
            userId: newUser._id,
            username: newUser.username,
            status: newUser.status
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
    console.error('Create user error:', err);

    // 如果是超时错误，尝试不使用事务的简单创建方式
    if (err.message?.includes('timeout') || err.message?.includes('Session start timeout')) {
      console.log('Transaction failed, trying simple creation...');
      try {
        // 简单创建用户（不使用事务）
        const newUser = await MongoUser.create({
          username,
          password: await hashStr(password),
          status,
          timezone,
          promotionRate
        });

        // 创建默认团队 - 简单模式下不使用session
        // 注意：这里不能使用createDefaultTeam，因为它需要session
        // 我们需要手动创建团队和成员关系
        const newTeam = await MongoTeam.create({
          ownerId: newUser._id,
          name: `${username}'s Team`,
          avatar: '/icon/logo.svg',
          createTime: new Date()
        });

        await MongoTeamMember.create({
          teamId: newTeam._id,
          userId: newUser._id,
          name: 'Owner',
          role: TeamMemberRoleEnum.owner,
          status: TeamMemberStatusEnum.active,
          createTime: new Date()
        });

        // 如果指定了其他团队，添加到这些团队
        if (teamIds.length > 0) {
          for (const teamId of teamIds) {
            const role = teamRoles[teamId] || TeamMemberRoleEnum.member;
            await MongoTeamMember.create({
              teamId,
              userId: newUser._id,
              role,
              status: TeamMemberStatusEnum.active
            });
          }
        }

        return jsonRes(res, {
          data: {
            userId: newUser._id,
            username: newUser.username,
            status: newUser.status
          }
        });
      } catch (simpleErr: any) {
        console.error('Simple creation also failed:', simpleErr);
        return jsonRes(res, {
          code: 500,
          message: '创建用户失败',
          error: process.env.NODE_ENV === 'development' ? simpleErr.message : undefined
        });
      }
    }

    // 根据错误类型返回不同的错误信息
    let errorMessage = '创建用户失败';
    if (err.message?.includes('duplicate')) {
      errorMessage = '用户名已存在';
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
