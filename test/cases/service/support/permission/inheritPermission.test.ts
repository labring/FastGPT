import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import {
  replaceResourceClbs,
  syncChildrenPermission
} from '@fastgpt/service/support/permission/inheritPermission';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { describe, it, expect } from 'vitest';

describe.sequential('syncChildrenPermission', () => {
  const createApp = async ({
    user,
    name,
    type,
    parentId
  }: {
    user: parseHeaderCertRet;
    name: string;
    type: AppTypeEnum;
    parentId?: string;
  }) =>
    mongoSessionRun(async (session) => {
      const app = await MongoApp.create({
        teamId: user.teamId,
        tmbId: user.tmbId,
        ...(parentId ? { parentId } : {}),
        name,
        type,
        inheritPermission: true
      });
      if (type === 'folder') {
        await createResourceDefaultCollaborators({
          resource: app,
          resourceType: PerResourceTypeEnum.app,
          session,
          tmbId: String(user.tmbId)
        });
      }
      return app;
    });

  it('sync: add/update/delete clbs', async () => {
    const users = await getFakeUsers(5);

    // ========== 步骤1: 创建两个文件夹 f1(根) 和 f2(f1的子文件夹) ==========
    // 每个 folder 创建时会自动为其生成一条 owner 权限
    const f1 = await createApp({
      user: users.owner,
      name: 'f1',
      type: AppTypeEnum.folder
    });
    const f2 = await createApp({
      user: users.owner,
      name: 'f2',
      type: AppTypeEnum.folder,
      parentId: String(f1._id)
    });
    // 验证: f1 和 f2 各有一条 owner 权限，总计 2 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(2);

    // ========== 步骤2: 定义协作者列表并同步到 f1 的子资源 ==========
    // clbs 包含: owner + member0(Read) + member1(Read)
    const clbs = [
      {
        tmbId: String(users.owner.tmbId),
        permission: OwnerRoleVal
      },
      {
        tmbId: String(users.members[0].tmbId),
        permission: ReadRoleVal
      },
      {
        tmbId: users.members[1].tmbId,
        permission: ReadRoleVal
      }
    ];

    await mongoSessionRun(async (session) => {
      // 将 clbs 同步到 f1 的所有子资源(f2)
      // f2 已有 owner，member0 和 member1 会被新增
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
      // 手动给 f1 添加 member0 和 member1 的 Read 权限
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ReadRoleVal,
        tmbId: users.members[0].tmbId,
        teamId: users.members[0].teamId,
        session
      });
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ReadRoleVal,
        tmbId: users.members[1].tmbId,
        teamId: users.members[1].teamId,
        session
      });
    });
    // 验证: f1 有 3 条(owner+member0+member1)，f2 有 3 条(owner+member0+member1)
    // 总计 6 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(6);

    // ========== 步骤3: 创建 f3(f2的子文件夹)并同步权限 ==========
    const f3 = await createApp({
      name: 'f3',
      user: users.owner,
      type: AppTypeEnum.folder,
      parentId: String(f2._id)
    });

    await mongoSessionRun(async (session) => {
      // 从 f3 开始同步，f3 没有子 folder，所以只给 f3 本身不操作
      // 但 f3 创建时已生成 owner 权限
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f3,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });
    // 验证: f1(3) + f2(3) + f3(3，继承自f2) = 9 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(9);

    // ========== 步骤4: 创建 a1(f3下的非文件夹应用) ==========
    const a1 = await createApp({
      name: 'a1',
      user: users.owner,
      type: AppTypeEnum.simple,
      parentId: String(f3._id)
    });

    await mongoSessionRun(async (session) => {
      // a1 不是 folder，syncChildrenPermission 会直接返回不操作
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: a1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });
    // 但 createApp 时也不会为 simple 类型创建权限，总数保持 9 条
    // 实际的API接口会创建权限，但测试文件的createApp不会
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(9);

    // ========== 步骤5: 更新权限 - 将 member1 从 Read 改为 Manage ==========
    await mongoSessionRun(async (session) => {
      const clbs = [
        {
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        },
        {
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        },
        {
          tmbId: String(users.members[1].tmbId),
          permission: ManageRoleVal
        }
      ];
      // 从 f1 开始同步，会更新 f2、f3 中 member1 的权限为 Manage
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });

      // 同时手动更新 f1 上 member1 的权限为 Manage
      await MongoResourcePermission.updateOne(
        {
          resourceType: PerResourceTypeEnum.app,
          resourceId: String(f1._id),
          tmbId: String(users.members[1].tmbId)
        },
        {
          permission: ManageRoleVal
        }
      );
    });

    // console.log(await MongoResourcePermission.find({ resourceType: 'app' }));

    // 验证: 更新操作不改变记录数量，总数仍为 9 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(9);

    // ========== 步骤6: 删除权限 - 移除 member1 的所有权限 ==========
    await mongoSessionRun(async (session) => {
      const clbs = [
        {
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        },
        {
          tmbId: String(users.members[0].tmbId),
          permission: ReadRoleVal
        }
      ];
      // 从 f1 开始同步，会从 f2、f3 中删除 member1 的权限
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });

      // 手动删除 f1 上 member1 的权限
      await MongoResourcePermission.deleteOne(
        {
          resourceType: PerResourceTypeEnum.app,
          resourceId: String(f1._id),
          tmbId: String(users.members[1].tmbId),
          teamId: String(users.members[1].teamId)
        },
        { session }
      );
    });

    // 验证: f1 删除 member1 后剩 2 条(owner+member0)
    // f2 删除 member1 后剩 2 条(owner转为Manage+member0)
    // f3 仍为 2 条(owner+member0)
    // 总计 2 + 2 + 2 = 6 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(6);
  });

  it('不同创建者的子文件夹权限同步', async () => {
    // ========== 步骤1: 创建 f1(根文件夹，owner创建) ==========
    const users = await getFakeUsers(5);
    const f1 = await createApp({
      user: users.owner,
      name: 'f1-different-owner',
      type: AppTypeEnum.folder
    });

    // ========== 步骤2: 创建 f2(f1的子文件夹，member0创建) ==========
    const f2 = await createApp({
      user: users.members[0],
      name: 'f2-different-owner',
      type: AppTypeEnum.folder,
      parentId: String(f1._id)
    });

    // ========== 步骤3: 创建 f3(f2的子文件夹，member1创建) ==========
    const f3 = await createApp({
      user: users.members[1],
      name: 'f3-different-owner',
      type: AppTypeEnum.folder,
      parentId: String(f2._id)
    });

    // 验证初始状态: 每个 folder 创建时生成一条 owner 权限
    // 注意: 由于 getFakeUsers(5) 会创建 owner + manager + 5 members，且之前测试已创建了资源
    // 数据库中可能已有残留数据，所以实际数量可能大于 3
    // f1(owner), f2(member0), f3(member1) 至少 3 条
    const initialCount = await MongoResourcePermission.countDocuments({
      resourceType: 'app'
    });
    expect(initialCount).toBeGreaterThanOrEqual(3);

    // ========== 步骤4: 配置 f1 的权限并同步到所有子资源 ==========
    const clbs = [
      {
        tmbId: String(users.owner.tmbId),
        permission: OwnerRoleVal
      },
      {
        tmbId: String(users.members[0].tmbId),
        permission: ReadRoleVal
      },
      {
        tmbId: String(users.members[1].tmbId),
        permission: ManageRoleVal
      }
    ];

    await mongoSessionRun(async (session) => {
      // 从 f1 开始同步，会递归同步到 f2 和 f3
      // f2 原有 owner(member0)，由于 myOwnerIds 会跳过该协作者，所以:
      //   - member0 的权限保持 Owner 不变(不会覆盖为 Read)
      //   - 新增 owner(owner→Manage)、member1(Manage)
      // f3 原有 owner(member1)，同理:
      //   - member1 的权限保持 Owner 不变(不会覆盖为 Manage)
      //   - 新增 owner(owner→Manage)、member0(Read)
      await syncChildrenPermission({
        collaborators: clbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });

    // 验证同步后状态:
    // f1: 1 条(owner，未变)
    // f2: 3 条(owner(member0保留) + owner(owner→Manage) + member1(Manage))
    //   - member0 在 f2 是 owner，sync 时跳过，保持 Owner
    //   - owner 新增 Manage
    //   - member1 新增 Manage
    // f3: 3 条(owner(member1保留) + owner(owner→Manage) + member0(Read))
    //   - member1 在 f3 是 owner，sync 时跳过，保持 Owner
    //   - owner 新增 Manage
    //   - member0 新增 Read
    // 总计 1 + 3 + 3 = 7 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(7);

    // ========== 步骤5: 验证 f2 的权限详情 ==========
    const f2Permissions = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f2._id)
    }).lean();

    // f2 应该有 3 条权限记录
    expect(f2Permissions.length).eq(3);

    // 验证 f2 中 member0 的原始 owner 权限被保留(不会被覆盖为 Read)
    const f2Member0Owner = f2Permissions.find(
      (p) => String(p.tmbId) === String(users.members[0].tmbId) && p.permission === OwnerRoleVal
    );
    expect(f2Member0Owner).toBeDefined();

    // 验证 f2 中 owner 的权限被同步为 Manage
    const f2OwnerManage = f2Permissions.find(
      (p) => String(p.tmbId) === String(users.owner.tmbId) && p.permission === ManageRoleVal
    );
    expect(f2OwnerManage).toBeDefined();

    // 验证 f2 中 member1 的权限被同步为 Manage
    const f2Member1Manage = f2Permissions.find(
      (p) => String(p.tmbId) === String(users.members[1].tmbId) && p.permission === ManageRoleVal
    );
    expect(f2Member1Manage).toBeDefined();

    // ========== 步骤6: 验证 f3 的权限详情 ==========
    const f3Permissions = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f3._id)
    }).lean();

    // f3 应该有 3 条权限记录
    expect(f3Permissions.length).eq(3);

    // 验证 f3 中 member1 的原始 owner 权限被保留(不会被覆盖为 Manage)
    const f3Member1Owner = f3Permissions.find(
      (p) => String(p.tmbId) === String(users.members[1].tmbId) && p.permission === OwnerRoleVal
    );
    expect(f3Member1Owner).toBeDefined();

    // 验证 f3 中 owner 的权限被同步为 Manage
    const f3OwnerManage = f3Permissions.find(
      (p) => String(p.tmbId) === String(users.owner.tmbId) && p.permission === ManageRoleVal
    );
    expect(f3OwnerManage).toBeDefined();

    // 验证 f3 中 member0 的权限被同步为 Read
    const f3Member0Read = f3Permissions.find(
      (p) => String(p.tmbId) === String(users.members[0].tmbId) && p.permission === ReadRoleVal
    );
    expect(f3Member0Read).toBeDefined();

    // ========== 步骤7: 更新权限并验证子资源同步 ==========
    await mongoSessionRun(async (session) => {
      const updatedClbs = [
        {
          tmbId: String(users.owner.tmbId),
          permission: OwnerRoleVal
        },
        {
          tmbId: String(users.members[0].tmbId),
          permission: ManageRoleVal
        }
      ];
      // 从 f1 开始同步更新:
      // f2: member1 被删除；member0 从 Read 升级为 Manage(但 f2 中 member0 是 Owner，跳过)
      // f3: member1 被删除；member0 从 Read 升级为 Manage
      await syncChildrenPermission({
        collaborators: updatedClbs,
        folderTypeList: AppFolderTypeList,
        resource: f1,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        session
      });
    });

    // 验证更新后:
    // f1: 1 条(owner)
    // f2: 3 条(owner(member0保留) + owner(owner→Manage) + member1被删除)
    //   注意: member0 在 f2 是 owner，所以不会更新为 Manage
    // f3: 3 条(owner(member1保留) + owner(owner→Manage) + member0(Manage))
    //   注意: member0 在 f3 从 Read 升级为 Manage；member1 被删除
    // 总计 1 + 2 + 3 = 6 条
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app'
      })
    ).eq(6);

    // 验证 f2 中 member0 的权限仍为 Owner(不会被覆盖为 Manage)
    const f2UpdatedPermissions = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f2._id)
    }).lean();
    const f2Member0StillOwner = f2UpdatedPermissions.find(
      (p) => String(p.tmbId) === String(users.members[0].tmbId) && p.permission === OwnerRoleVal
    );
    expect(f2Member0StillOwner).toBeDefined();

    // 验证 f2 中 member1 的权限已被删除
    const f2Member1Deleted = f2UpdatedPermissions.find(
      (p) => String(p.tmbId) === String(users.members[1].tmbId)
    );
    expect(f2Member1Deleted).toBeUndefined();

    // 验证 f3 中 member0 的权限已更新为 Manage
    const f3UpdatedPermissions = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f3._id)
    }).lean();
    const f3Member0Manage = f3UpdatedPermissions.find(
      (p) => String(p.tmbId) === String(users.members[0].tmbId) && p.permission === ManageRoleVal
    );
    expect(f3Member0Manage).toBeDefined();
  });

  it('replaceResourceClbs: 替换资源协作者，保留现有 owner', async () => {
    // ========== 步骤1: 创建文件夹并初始化权限 ==========
    const users = await getFakeUsers(5);
    const f1 = await createApp({
      user: users.owner,
      name: 'f1-replace',
      type: AppTypeEnum.folder
    });

    // 初始状态: f1 有 1 条 owner 权限
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: 'app',
        resourceId: String(f1._id)
      })
    ).eq(1);

    // ========== 步骤2: 手动添加 member0 和 member1 的权限 ==========
    await mongoSessionRun(async (session) => {
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ReadRoleVal,
        tmbId: users.members[0].tmbId,
        teamId: users.members[0].teamId,
        session
      });
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ManageRoleVal,
        tmbId: users.members[1].tmbId,
        teamId: users.members[1].teamId,
        session
      });
    });

    // 验证: f1 现在有 3 条权限(owner + member0-Read + member1-Manage)
    const beforeReplace = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f1._id)
    }).lean();
    expect(beforeReplace.length).eq(3);

    // ========== 步骤3: 使用 replaceResourceClbs 替换协作者 ==========
    // 新协作者列表: owner + member0(Manage) + member2(Read)
    // - owner 保持不变(因为是 owner)
    // - member0 从 Read 更新为 Manage
    // - member1 被删除(不在新列表中)
    // - member2 被新增
    await mongoSessionRun(async (session) => {
      await replaceResourceClbs({
        resourceType: PerResourceTypeEnum.app,
        teamId: String(users.owner.teamId),
        resourceId: String(f1._id),
        collaborators: [
          {
            tmbId: String(users.owner.tmbId),
            permission: OwnerRoleVal
          },
          {
            tmbId: String(users.members[0].tmbId),
            permission: ManageRoleVal
          },
          {
            tmbId: String(users.members[2].tmbId),
            permission: ReadRoleVal
          }
        ],
        session
      });
    });

    // ========== 步骤4: 验证替换后的权限状态 ==========
    const afterReplace = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f1._id)
    }).lean();

    // 应该有 3 条权限记录(owner + member0-Manage + member2-Read)
    expect(afterReplace.length).eq(3);

    // 验证 owner 权限保持不变(仍为 Owner，不是 Manage)
    const ownerClb = afterReplace.find((p) => String(p.tmbId) === String(users.owner.tmbId));
    expect(ownerClb).toBeDefined();
    expect(ownerClb?.permission).eq(OwnerRoleVal);

    // 验证 member0 的权限从 Read 更新为 Manage
    const member0Clb = afterReplace.find((p) => String(p.tmbId) === String(users.members[0].tmbId));
    expect(member0Clb).toBeDefined();
    expect(member0Clb?.permission).eq(ManageRoleVal);

    // 验证 member2 被新增，权限为 Read
    const member2Clb = afterReplace.find((p) => String(p.tmbId) === String(users.members[2].tmbId));
    expect(member2Clb).toBeDefined();
    expect(member2Clb?.permission).eq(ReadRoleVal);

    // 验证 member1 已被删除
    const member1Clb = afterReplace.find((p) => String(p.tmbId) === String(users.members[1].tmbId));
    expect(member1Clb).toBeUndefined();
  });

  it('replaceResourceClbs: owner 传入时转换为 Manage，但已有 owner 保留', async () => {
    // ========== 步骤1: 创建文件夹并初始化权限 ==========
    const users = await getFakeUsers(5);
    const f1 = await createApp({
      user: users.owner,
      name: 'f1-owner-convert',
      type: AppTypeEnum.folder
    });

    // ========== 步骤2: 给 member0 添加 Manage 权限 ==========
    await mongoSessionRun(async (session) => {
      await MongoResourcePermission.insertOne({
        resourceId: f1._id,
        resourceType: PerResourceTypeEnum.app,
        permission: ManageRoleVal,
        tmbId: users.members[0].tmbId,
        teamId: users.members[0].teamId,
        session
      });
    });

    // 验证初始状态: 2 条权限
    const beforeReplace = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f1._id)
    }).lean();
    expect(beforeReplace.length).eq(2);

    // ========== 步骤3: 传入包含 Owner 的协作者列表 ==========
    // collaborators 中传入 OwnerRoleVal，但 replaceResourceClbs 会将其转换为 ManageRoleVal
    await mongoSessionRun(async (session) => {
      await replaceResourceClbs({
        resourceType: PerResourceTypeEnum.app,
        teamId: String(users.owner.teamId),
        resourceId: String(f1._id),
        collaborators: [
          {
            tmbId: String(users.owner.tmbId),
            permission: ReadRoleVal
          },
          {
            tmbId: String(users.members[0].tmbId),
            permission: OwnerRoleVal // 传入 Owner，但会被转为 Manage
          }
        ],
        session
      });
    });

    // ========== 步骤4: 验证权限转换结果 ==========
    const afterReplace = await MongoResourcePermission.find({
      resourceType: 'app',
      resourceId: String(f1._id)
    }).lean();

    // 应该有 2 条权限记录
    expect(afterReplace.length).eq(2);

    // 验证原有 owner(users.owner) 保持 Owner 不变
    const ownerClb = afterReplace.find((p) => String(p.tmbId) === String(users.owner.tmbId));
    expect(ownerClb?.permission).eq(OwnerRoleVal);

    // 验证 member0 的权限被更新为 Manage(因为传入的 Owner 被转换了)
    // 但 member0 不是现有 owner，所以会被更新
    const member0Clb = afterReplace.find((p) => String(p.tmbId) === String(users.members[0].tmbId));
    expect(member0Clb?.permission).eq(ManageRoleVal);
  });
});
