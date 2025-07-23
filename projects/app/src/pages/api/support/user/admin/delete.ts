import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { startSession, type ClientSession } from 'mongoose';

export type DeleteUserBody = {
  userIds: string[];
  transferToUserId?: string; // 资源转移到的用户ID
  deleteResources?: boolean; // 是否删除用户的资源
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  // 提取请求参数到外层作用域
  const { userIds, transferToUserId, deleteResources = false } = req.body as DeleteUserBody;

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 验证参数
    if (!userIds || userIds.length === 0) {
      return jsonRes(res, {
        code: 400,
        message: 'User IDs are required'
      });
    }

    // 检查用户是否存在
    const users = await MongoUser.find({ _id: { $in: userIds } });
    if (users.length !== userIds.length) {
      return jsonRes(res, {
        code: 400,
        message: 'Some users do not exist'
      });
    }

    // 如果指定了转移用户，检查转移用户是否存在
    if (transferToUserId) {
      const transferUser = await MongoUser.findById(transferToUserId);
      if (!transferUser) {
        return jsonRes(res, {
          code: 400,
          message: 'Transfer user does not exist'
        });
      }
    }

    let session: ClientSession | null = null;
    const deletedUsers: string[] = [];
    const errors: { userId: string; error: string }[] = [];

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
        for (const userId of userIds) {
          try {
            // 检查用户是否是团队所有者
            const ownedTeams = await MongoTeam.find({ ownerId: userId });

            if (ownedTeams.length > 0 && !transferToUserId && !deleteResources) {
              errors.push({
                userId,
                error: 'User owns teams. Please specify transfer user or delete resources.'
              });
              continue;
            }

            // 处理用户拥有的团队
            for (const team of ownedTeams) {
              if (transferToUserId) {
                // 转移团队所有权
                await MongoTeam.findByIdAndUpdate(
                  team._id,
                  { ownerId: transferToUserId },
                  { session }
                );

                // 确保转移用户是团队成员
                const existingMember = await MongoTeamMember.findOne({
                  teamId: team._id,
                  userId: transferToUserId
                });

                if (!existingMember) {
                  await MongoTeamMember.create(
                    [
                      {
                        teamId: team._id,
                        userId: transferToUserId,
                        name: 'Owner',
                        role: 'owner',
                        status: 'active',
                        createTime: new Date()
                      }
                    ],
                    { session }
                  );
                } else {
                  await MongoTeamMember.findByIdAndUpdate(
                    existingMember._id,
                    { role: 'owner' },
                    { session }
                  );
                }
              } else if (deleteResources) {
                // 删除团队及相关资源
                await MongoTeam.findByIdAndDelete(team._id, { session: session! });
                await MongoTeamMember.deleteMany({ teamId: team._id }, { session: session! });

                // 删除团队的应用和知识库
                await MongoApp.deleteMany({ teamId: team._id }, { session: session! });
                await MongoDataset.deleteMany({ teamId: team._id }, { session: session! });
              }
            }

            // 处理用户创建的资源
            if (transferToUserId) {
              // 转移应用
              await MongoApp.updateMany(
                { tmbId: userId },
                { tmbId: transferToUserId },
                { session: session! }
              );

              // 转移知识库
              await MongoDataset.updateMany(
                { tmbId: userId },
                { tmbId: transferToUserId },
                { session: session! }
              );
            } else if (deleteResources) {
              // 删除用户的应用和知识库
              await MongoApp.deleteMany({ tmbId: userId }, { session: session! });
              await MongoDataset.deleteMany({ tmbId: userId }, { session: session! });
            }

            // 删除用户的团队成员关系
            await MongoTeamMember.deleteMany({ userId }, { session: session! });

            // 删除用户
            await MongoUser.findByIdAndDelete(userId, { session: session! });

            deletedUsers.push(userId);
          } catch (error) {
            console.error(`Error deleting user ${userId}:`, error);
            errors.push({
              userId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
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

    return jsonRes(res, {
      data: {
        deletedUsers,
        errors,
        success: deletedUsers.length,
        failed: errors.length
      }
    });
  } catch (err: any) {
    console.error('Delete users error:', err);

    // 如果是超时错误，尝试不使用事务的简单删除方式
    if (err.message?.includes('timeout') || err.message?.includes('Session start timeout')) {
      console.log('Transaction failed, trying simple deletion...');
      try {
        const deletedUsers: string[] = [];
        const errors: { userId: string; error: string }[] = [];

        for (const userId of userIds) {
          try {
            // 检查用户是否是团队所有者
            const ownedTeams = await MongoTeam.find({ ownerId: userId });

            if (ownedTeams.length > 0 && !transferToUserId && !deleteResources) {
              errors.push({
                userId,
                error: 'User owns teams. Please specify transfer user or delete resources.'
              });
              continue;
            }

            // 处理用户拥有的团队（简单方式）
            for (const team of ownedTeams) {
              if (deleteResources) {
                await MongoApp.deleteMany({ teamId: team._id });
                await MongoDataset.deleteMany({ teamId: team._id });
                await MongoTeamMember.deleteMany({ teamId: team._id });
                await MongoTeam.deleteOne({ _id: team._id });
              } else if (transferToUserId) {
                await MongoTeam.updateOne(
                  { _id: team._id },
                  { $set: { ownerId: transferToUserId } }
                );
              }
            }

            // 删除用户的团队成员关系
            await MongoTeamMember.deleteMany({ userId });

            // 删除用户
            await MongoUser.findByIdAndDelete(userId);

            deletedUsers.push(userId);
          } catch (error) {
            console.error(`Error deleting user ${userId}:`, error);
            errors.push({
              userId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        return jsonRes(res, {
          data: {
            deletedUsers,
            errors,
            success: deletedUsers.length,
            failed: errors.length
          }
        });
      } catch (simpleErr: any) {
        console.error('Simple user deletion also failed:', simpleErr);
        return jsonRes(res, {
          code: 500,
          message: '删除用户失败',
          error: process.env.NODE_ENV === 'development' ? simpleErr.message : undefined
        });
      }
    }

    return jsonRes(res, {
      code: 500,
      message: '删除用户失败',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

export default handler;
