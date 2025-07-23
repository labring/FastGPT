import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import {
  ReadPermissionVal,
  WritePermissionVal,
  ManagePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Permission Check ===');

    // 检查当前用户信息
    let currentUser = null;
    let isRoot = false;
    try {
      const authResult = await authCert({ req, authToken: true });
      isRoot = authResult.isRoot;
      if (authResult.userId) {
        currentUser = await MongoUser.findById(authResult.userId).lean();
      }
      console.log('Current user:', currentUser?.username, 'isRoot:', isRoot);
    } catch (authError) {
      console.log('Auth failed:', authError);
    }

    // 检查权限常量值
    console.log('Permission values:');
    console.log(
      '- ReadPermissionVal:',
      ReadPermissionVal,
      '(binary:',
      ReadPermissionVal.toString(2),
      ')'
    );
    console.log(
      '- WritePermissionVal:',
      WritePermissionVal,
      '(binary:',
      WritePermissionVal.toString(2),
      ')'
    );
    console.log(
      '- ManagePermissionVal:',
      ManagePermissionVal,
      '(binary:',
      ManagePermissionVal.toString(2),
      ')'
    );

    console.log('Default permission values:');
    console.log(
      '- AppDefaultPermissionVal:',
      AppDefaultPermissionVal,
      '(binary:',
      AppDefaultPermissionVal.toString(2),
      ')'
    );
    console.log(
      '- DatasetDefaultPermissionVal:',
      DatasetDefaultPermissionVal,
      '(binary:',
      DatasetDefaultPermissionVal.toString(2),
      ')'
    );

    // 测试权限检查
    const testPermissions = [
      { name: 'NullPermission', value: 0 },
      { name: 'ReadPermission', value: ReadPermissionVal },
      { name: 'WritePermission', value: WritePermissionVal },
      { name: 'ManagePermission', value: ManagePermissionVal },
      { name: 'AppDefault', value: AppDefaultPermissionVal },
      { name: 'DatasetDefault', value: DatasetDefaultPermissionVal }
    ];

    const permissionTests = testPermissions.map((perm) => {
      const appPer = new AppPermission({ per: perm.value, isOwner: false });
      return {
        name: perm.name,
        value: perm.value,
        binary: perm.value.toString(2),
        hasReadPer: appPer.hasReadPer,
        hasWritePer: appPer.hasWritePer,
        hasManagePer: appPer.hasManagePer
      };
    });

    console.log('Permission test results:', permissionTests);

    return jsonRes(res, {
      data: {
        currentUser: {
          username: currentUser?.username,
          isRoot,
          canManagePermissions: isRoot || currentUser?.username === 'root'
        },
        constants: {
          ReadPermissionVal,
          WritePermissionVal,
          ManagePermissionVal,
          AppDefaultPermissionVal,
          DatasetDefaultPermissionVal
        },
        tests: permissionTests,
        summary: {
          appDefaultHasRead: AppDefaultPermissionVal >= ReadPermissionVal,
          datasetDefaultHasRead: DatasetDefaultPermissionVal >= ReadPermissionVal,
          rootUserStatus: isRoot ? '✅ Root用户权限正常' : '❌ 非Root用户',
          message:
            AppDefaultPermissionVal >= ReadPermissionVal
              ? '✅ 应用默认权限包含读取权限，团队成员可以查看彼此的应用'
              : '❌ 应用默认权限不包含读取权限，团队成员无法查看彼此的应用'
        }
      }
    });
  } catch (err: any) {
    console.error('Permission check error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error',
      error: {
        stack: err.stack,
        name: err.name
      }
    });
  }
}

export default handler;
