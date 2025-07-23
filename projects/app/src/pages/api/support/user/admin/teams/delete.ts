import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
// import { connectToDatabase } from '@/service/mongo';
import { startSession, type ClientSession } from 'mongoose';

export type DeleteTeamBody = {
  teamIds: string[];
  transferToTeamId?: string; // 资源转移到的团队ID
  deleteResources?: boolean; // 是否删除资源
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'DELETE') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  // 提取请求参数到外层作用域
  const { teamIds, transferToTeamId, deleteResources = false } = req.body as DeleteTeamBody;

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 验证参数
    if (!teamIds || teamIds.length === 0) {
      return jsonRes(res, {
        code: 400,
        message: '团队ID列表不能为空'
      });
    }

    // 检查团队是否存在
    const teams = await MongoTeam.find({ _id: { $in: teamIds } });
    if (teams.length !== teamIds.length) {
      return jsonRes(res, {
        code: 400,
        message: '部分团队不存在'
      });
    }

    // 如果指定了转移团队，验证转移目标团队是否存在
    if (transferToTeamId && !deleteResources) {
      const transferTeam = await MongoTeam.findById(transferToTeamId);
      if (!transferTeam) {
        return jsonRes(res, {
          code: 400,
          message: '转移目标团队不存在'
        });
      }
    }

    // 尝试使用事务删除团队
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
        for (const teamId of teamIds) {
          // 处理团队资源
          if (deleteResources) {
            // 删除团队的应用
            await MongoApp.deleteMany({ teamId }, { session: session! });

            // 删除团队的数据集
            await MongoDataset.deleteMany({ teamId }, { session: session! });
          } else if (transferToTeamId) {
            // 转移团队的应用
            await MongoApp.updateMany(
              { teamId },
              { $set: { teamId: transferToTeamId } },
              { session: session! }
            );

            // 转移团队的数据集
            await MongoDataset.updateMany(
              { teamId },
              { $set: { teamId: transferToTeamId } },
              { session: session! }
            );
          }

          // 删除团队成员
          await MongoTeamMember.deleteMany({ teamId }, { session: session! });

          // 删除团队
          await MongoTeam.deleteOne({ _id: teamId }, { session: session! });
        }

        return jsonRes(res, {
          data: {
            deletedCount: teamIds.length,
            message: `成功删除 ${teamIds.length} 个团队`
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
    console.error('Delete team error:', err);

    // 如果是超时错误，尝试不使用事务的简单删除方式
    if (err.message?.includes('timeout') || err.message?.includes('Session start timeout')) {
      console.log('Transaction failed, trying simple deletion...');
      try {
        for (const teamId of teamIds) {
          // 简单删除（不使用事务）
          if (deleteResources) {
            await MongoApp.deleteMany({ teamId });
            await MongoDataset.deleteMany({ teamId });
          }

          await MongoTeamMember.deleteMany({ teamId });
          await MongoTeam.deleteOne({ _id: teamId });
        }

        return jsonRes(res, {
          data: {
            deletedCount: teamIds.length,
            message: `成功删除 ${teamIds.length} 个团队`
          }
        });
      } catch (simpleErr: any) {
        console.error('Simple team deletion also failed:', simpleErr);
        return jsonRes(res, {
          code: 500,
          message: '删除团队失败',
          error: process.env.NODE_ENV === 'development' ? simpleErr.message : undefined
        });
      }
    }

    return jsonRes(res, {
      code: 500,
      message: '删除团队失败',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

export default handler;
