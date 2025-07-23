import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import type { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { startSession, type ClientSession } from 'mongoose';

export type UpdateUserBody = {
  userId: string;
  username?: string;
  password?: string;
  status?: `${UserStatusEnum}`;
  timezone?: string;
  promotionRate?: number;
  teamUpdates?: {
    teamId: string;
    role?: `${TeamMemberRoleEnum}`;
    status?: `${TeamMemberStatusEnum}`;
    action: 'add' | 'update' | 'remove';
  }[];
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  // 提取请求参数到外层作用域
  const {
    userId,
    username,
    password,
    status,
    timezone,
    promotionRate,
    teamUpdates = []
  } = req.body as UpdateUserBody;

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 验证用户ID
    if (!userId) {
      return jsonRes(res, {
        code: 400,
        message: 'User ID is required'
      });
    }

    // 检查用户是否存在
    const existingUser = await MongoUser.findById(userId);
    if (!existingUser) {
      return jsonRes(res, {
        code: 404,
        message: 'User not found'
      });
    }

    // 如果更新用户名，检查是否重复
    if (username && username !== existingUser.username) {
      const duplicateUser = await MongoUser.findOne({ username, _id: { $ne: userId } });
      if (duplicateUser) {
        return jsonRes(res, {
          code: 400,
          message: 'Username already exists'
        });
      }
    }

    let session: ClientSession | null = null;

    try {
      // 启动会话，设置超时时间
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
        // 更新用户基本信息
        const updateData: any = {};
        if (username) updateData.username = username;
        if (password) updateData.password = hashStr(password);
        if (status) updateData.status = status;
        if (timezone) updateData.timezone = timezone;
        if (promotionRate !== undefined) updateData.promotionRate = promotionRate;

        if (Object.keys(updateData).length > 0) {
          await MongoUser.findByIdAndUpdate(userId, updateData, { session: session! });
        }

        // 处理团队成员关系更新
        for (const teamUpdate of teamUpdates) {
          const { teamId, role, status: memberStatus, action } = teamUpdate;

          switch (action) {
            case 'add':
              // 检查是否已经是团队成员
              const existingMember = await MongoTeamMember.findOne({ teamId, userId });
              if (!existingMember) {
                await MongoTeamMember.create(
                  [
                    {
                      teamId,
                      userId,
                      name: username || existingUser.username,
                      role: role || TeamMemberRoleEnum.member,
                      status: memberStatus || TeamMemberStatusEnum.active,
                      createTime: new Date()
                    }
                  ],
                  { session: session! }
                );
              }
              break;

            case 'update':
              const updateMemberData: any = {};
              if (role) updateMemberData.role = role;
              if (memberStatus) updateMemberData.status = memberStatus;
              if (username) updateMemberData.name = username;

              if (Object.keys(updateMemberData).length > 0) {
                await MongoTeamMember.findOneAndUpdate({ teamId, userId }, updateMemberData, {
                  session: session!
                });
              }
              break;

            case 'remove':
              await MongoTeamMember.findOneAndDelete({ teamId, userId }, { session: session! });
              break;
          }
        }
      });

      // 获取更新后的用户信息
      const updatedUser = await MongoUser.findById(userId).select('-password');
      const teamMembers = await MongoTeamMember.find({ userId }).populate('teamId', 'name');

      return jsonRes(res, {
        data: {
          user: updatedUser,
          teams: teamMembers
        }
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
    console.error('Update user error:', err);

    // 如果是超时错误，尝试不使用事务的简单更新方式
    if (err.message?.includes('timeout') || err.message?.includes('Session start timeout')) {
      console.log('Transaction failed, trying simple update...');
      try {
        // 更新用户基本信息（简单方式）
        const updateData: any = {};
        if (username) updateData.username = username;
        if (password) updateData.password = hashStr(password);
        if (status) updateData.status = status;
        if (timezone) updateData.timezone = timezone;
        if (promotionRate !== undefined) updateData.promotionRate = promotionRate;

        if (Object.keys(updateData).length > 0) {
          await MongoUser.findByIdAndUpdate(userId, updateData);
        }

        // 处理团队更新（简单方式）
        for (const teamUpdate of teamUpdates) {
          const { teamId, role, status: memberStatus, action } = teamUpdate;

          switch (action) {
            case 'add':
              await MongoTeamMember.create({
                teamId,
                userId,
                role: role || TeamMemberRoleEnum.member,
                status: memberStatus || TeamMemberStatusEnum.active
              });
              break;
            case 'update':
              const updateMemberData: any = {};
              if (role) updateMemberData.role = role;
              if (memberStatus) updateMemberData.status = memberStatus;

              if (Object.keys(updateMemberData).length > 0) {
                await MongoTeamMember.findOneAndUpdate({ teamId, userId }, updateMemberData);
              }
              break;
            case 'remove':
              await MongoTeamMember.findOneAndDelete({ teamId, userId });
              break;
          }
        }

        // 获取更新后的用户信息
        const updatedUser = await MongoUser.findById(userId).select('-password');
        const teamMembers = await MongoTeamMember.find({ userId }).populate('teamId', 'name');

        return jsonRes(res, {
          data: {
            user: updatedUser,
            teams: teamMembers
          }
        });
      } catch (simpleErr: any) {
        console.error('Simple user update also failed:', simpleErr);
        return jsonRes(res, {
          code: 500,
          message: '更新用户失败',
          error: process.env.NODE_ENV === 'development' ? simpleErr.message : undefined
        });
      }
    }

    return jsonRes(res, {
      code: 500,
      message: '更新用户失败',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

export default handler;
