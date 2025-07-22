import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

export type ListPermissionsBody = {
  searchKey?: string;
  resourceType?: string;
  teamId?: string;
  page?: number;
  pageSize?: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Admin Permissions List ===');

    // 验证管理员权限
    const { isRoot } = await authAdmin(req);

    if (!isRoot) {
      return jsonRes(res, {
        code: 403,
        message: 'Only root user can access permission management'
      });
    }

    const {
      searchKey,
      resourceType,
      teamId,
      page = 1,
      pageSize = 50
    } = req.body as ListPermissionsBody;

    console.log('Query params:', { searchKey, resourceType, teamId, page, pageSize });

    // 构建查询条件
    const query: any = {};

    if (resourceType) {
      query.resourceType = resourceType;
    }

    if (teamId) {
      query.teamId = teamId;
    }

    // 获取权限记录
    const permissions = await MongoResourcePermission.find(query)
      .sort({ createTime: -1 })
      .limit(pageSize)
      .skip((page - 1) * pageSize)
      .lean();

    console.log(`Found ${permissions.length} permission records`);

    if (permissions.length === 0) {
      return jsonRes(res, {
        data: {
          permissions: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0
        }
      });
    }

    // 获取相关资源信息
    const resourceIds = permissions.map((p) => p.resourceId);
    const teamIds = [...new Set(permissions.map((p) => p.teamId))];
    const userIds = [...new Set(permissions.filter((p) => p.tmbId).map((p) => p.tmbId))];

    const [apps, datasets, teams, teamMembers] = await Promise.all([
      resourceType === 'app' || (!resourceType && resourceIds.length > 0)
        ? MongoApp.find({ _id: { $in: resourceIds } }, 'name intro').lean()
        : [],
      resourceType === 'dataset' || (!resourceType && resourceIds.length > 0)
        ? MongoDataset.find({ _id: { $in: resourceIds } }, 'name intro').lean()
        : [],
      teamIds.length > 0 ? MongoTeam.find({ _id: { $in: teamIds } }, 'name').lean() : [],
      userIds.length > 0
        ? MongoTeamMember.find({ _id: { $in: userIds } }, 'name userId').lean()
        : []
    ]);

    // 获取用户信息
    const users =
      teamMembers.length > 0
        ? await MongoUser.find(
            {
              _id: { $in: teamMembers.map((tm) => tm.userId) }
            },
            'username'
          ).lean()
        : [];

    // 创建查找映射
    const resourceMap = new Map();
    apps.forEach((app) => resourceMap.set(app._id.toString(), { name: app.name, type: 'app' }));
    datasets.forEach((dataset) =>
      resourceMap.set(dataset._id.toString(), { name: dataset.name, type: 'dataset' })
    );

    const teamMap = new Map();
    teams.forEach((team) => teamMap.set(team._id.toString(), team.name));

    const memberMap = new Map();
    teamMembers.forEach((member) =>
      memberMap.set(member._id.toString(), { name: member.name, userId: member.userId })
    );

    const userMap = new Map();
    users.forEach((user) => userMap.set(user._id.toString(), user.username));

    // 组合权限数据
    let permissionRecords = permissions.map((perm) => {
      const resource = resourceMap.get(perm.resourceId.toString());
      const team = teamMap.get(perm.teamId.toString());
      const member = perm.tmbId ? memberMap.get(perm.tmbId.toString()) : null;
      const user = member ? userMap.get(member.userId.toString()) : null;

      return {
        _id: perm._id,
        resourceType: perm.resourceType,
        resourceId: perm.resourceId.toString(),
        resourceName: resource?.name || 'Unknown Resource',
        teamId: perm.teamId.toString(),
        teamName: team || 'Unknown Team',
        tmbId: perm.tmbId?.toString(),
        memberName: member?.name || user || null,
        groupId: perm.groupId?.toString(),
        groupName: null, // TODO: 获取组名
        orgId: perm.orgId?.toString(),
        orgName: null, // TODO: 获取组织名
        permission: perm.permission,
        createTime: new Date() // 权限记录没有createTime字段，使用当前时间
      };
    });

    // 应用搜索过滤
    if (searchKey) {
      const searchRegex = new RegExp(searchKey, 'i');
      permissionRecords = permissionRecords.filter(
        (record) =>
          searchRegex.test(record.resourceName) ||
          searchRegex.test(record.teamName) ||
          (record.memberName && searchRegex.test(record.memberName))
      );
    }

    const total = await MongoResourcePermission.countDocuments(query);

    console.log(`Returning ${permissionRecords.length} permission records`);

    return jsonRes(res, {
      data: {
        permissions: permissionRecords,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err: any) {
    console.error('List permissions error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error'
    });
  }
}

export default handler;
