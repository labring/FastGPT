import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { parseV2Pagination } from '@fastgpt/service/common/api/paginationV2';
import {
  ListAppV2BodySchema,
  ListAppV2ItemSchema
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  ListDatasetV2BodySchema,
  ListDatasetV2ItemSchema
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  ListSkillsV2QuerySchema,
  ListSkillsV2ItemSchema
} from '@fastgpt/global/openapi/core/ai/skill/api';

describe('parseV2Pagination', () => {
  it('全缺省时 pageSize=10、offset=0（第一页）', () => {
    expect(parseV2Pagination({})).toEqual({ pageSize: 10, offset: 0 });
  });

  it('仅给 pageSize 时 offset=0', () => {
    expect(parseV2Pagination({ pageSize: 20 })).toEqual({ pageSize: 20, offset: 0 });
  });

  it('offset=0 正确生效（?? 语义，非 truthy 判断）', () => {
    expect(parseV2Pagination({ pageSize: 20, offset: 0 })).toEqual({ pageSize: 20, offset: 0 });
  });

  it('pageNum 换算为 offset=(pageNum-1)*pageSize', () => {
    expect(parseV2Pagination({ pageSize: 20, pageNum: 3 })).toEqual({ pageSize: 20, offset: 40 });
  });

  it('pageNum 缺省视为 1', () => {
    expect(parseV2Pagination({ offset: 5 })).toEqual({ pageSize: 10, offset: 5 });
  });
});

describe('v2 分页参数边界（numbers-only + 互斥）', () => {
  const baseAppBody = { type: AppTypeEnum.workflow };

  it('pageSize 边界：0/负数/101 被拒，100 通过', () => {
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: 0 }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: -1 }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: 101 }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: 100 }).success).toBe(true);
  });

  it('数字字符串被拒（v2 只接受 number，无 coerce）', () => {
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: '10' }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, offset: '0' }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageNum: '1' }).success).toBe(false);
  });

  it('NaN 与 Infinity 被拒（z.number().int() 语义）', () => {
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: NaN }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageSize: Infinity }).success).toBe(
      false
    );
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, offset: -Infinity }).success).toBe(
      false
    );
  });

  it('offset 负数被拒、0 通过；pageNum 0 被拒、1 通过', () => {
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, offset: -1 }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, offset: 0 }).success).toBe(true);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageNum: 0 }).success).toBe(false);
    expect(ListAppV2BodySchema.safeParse({ ...baseAppBody, pageNum: 1 }).success).toBe(true);
  });

  it('offset 与 pageNum 同时给出被拒（superRefine 互斥）', () => {
    const result = ListAppV2BodySchema.safeParse({ ...baseAppBody, offset: 0, pageNum: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('offset 与 pageNum 互斥，二选一');
    }
  });

  it('空对象通过（全缺省）', () => {
    expect(ListAppV2BodySchema.safeParse({}).success).toBe(true);
  });

  it('dataset type 数组被拒（仅单值 enum）', () => {
    expect(ListDatasetV2BodySchema.safeParse({ type: [DatasetTypeEnum.dataset] }).success).toBe(
      false
    );
    expect(ListDatasetV2BodySchema.safeParse({ type: DatasetTypeEnum.dataset }).success).toBe(true);
  });

  it('skill v2 query 同样执行分页边界与互斥', () => {
    expect(ListSkillsV2QuerySchema.safeParse({ pageSize: -5 }).success).toBe(false);
    expect(ListSkillsV2QuerySchema.safeParse({ offset: 10, pageNum: 2 }).success).toBe(false);
    expect(ListSkillsV2QuerySchema.safeParse({ pageSize: 50, pageNum: 2 }).success).toBe(true);
  });
});

describe('app v2 body type 语义（复用旧 preprocess）', () => {
  it('type 空字符串按全部类型处理', () => {
    expect(ListAppV2BodySchema.parse({ type: '' })).toEqual({});
  });

  it('支持单类型与类型数组，非法类型被忽略', () => {
    expect(ListAppV2BodySchema.parse({ type: AppTypeEnum.workflow }).type).toBe(
      AppTypeEnum.workflow
    );
    expect(
      ListAppV2BodySchema.parse({ type: [AppTypeEnum.folder, AppTypeEnum.workflow] }).type
    ).toEqual([AppTypeEnum.folder, AppTypeEnum.workflow]);
    expect(ListAppV2BodySchema.parse({ type: ['unknown', AppTypeEnum.workflow] }).type).toEqual([
      AppTypeEnum.workflow
    ]);
  });
});

describe('v2 item schema 解析', () => {
  const oid = () => new Types.ObjectId().toString();
  const skillPermission = {
    role: ReadRoleVal,
    isOwner: false,
    hasManagePer: false,
    hasWritePer: false,
    hasReadPer: true,
    hasManageRole: false,
    hasWriteRole: false,
    hasReadRole: true
  };
  const appPermission = {
    role: ReadRoleVal,
    isOwner: false,
    hasManagePer: false,
    hasWritePer: false,
    hasReadPer: true,
    hasManageRole: false,
    hasWriteRole: false,
    hasReadRole: true,
    hasReadChatLogPer: false,
    hasReadChatLogRole: false
  };
  const vectorModel = {
    model: 'text-embedding-3',
    name: 'Embedding',
    provider: 'openai',
    type: 'embedding',
    defaultToken: 1000,
    maxToken: 8000,
    weight: 100
  };

  it('skill item：ObjectId/null 双形态与 Date 通过', () => {
    const item = {
      _id: new Types.ObjectId(),
      parentId: oid(),
      tmbId: oid(),
      source: 'personal',
      type: 'skill',
      name: 'Test Skill',
      description: '',
      category: [],
      inheritPermission: true,
      createTime: new Date(),
      updateTime: new Date(),
      permission: skillPermission,
      private: false
    };
    const parsed = ListSkillsV2ItemSchema.parse(item);
    expect(parsed._id).toBe(String(item._id));
    expect(parsed.createTime).toBeInstanceOf(Date);
  });

  it('skill item：system skill tmbId=null、根级 parentId=null 通过（owner store 场景）', () => {
    const item = {
      _id: oid(),
      parentId: null,
      tmbId: null,
      source: 'system',
      type: 'skill',
      name: 'System Skill',
      description: '',
      category: [],
      createTime: new Date(),
      updateTime: new Date(),
      permission: skillPermission
    };
    const parsed = ListSkillsV2ItemSchema.parse(item);
    expect(parsed.tmbId).toBeNull();
    expect(parsed.parentId).toBeNull();
  });

  it('skill item：sourceMember.status 可为 null（缺成员占位），非法 status 被拒', () => {
    const base = {
      _id: oid(),
      parentId: null,
      tmbId: oid(),
      source: 'personal',
      type: 'skill',
      name: 'S',
      description: '',
      category: [],
      createTime: new Date(),
      updateTime: new Date(),
      permission: skillPermission
    };
    expect(
      ListSkillsV2ItemSchema.safeParse({
        ...base,
        sourceMember: { name: '未知成员', avatar: null, status: null }
      }).success
    ).toBe(true);
    expect(
      ListSkillsV2ItemSchema.safeParse({
        ...base,
        sourceMember: { name: '张三', avatar: null, status: TeamMemberStatusEnum.active }
      }).success
    ).toBe(true);
    expect(
      ListSkillsV2ItemSchema.safeParse({
        ...base,
        sourceMember: { name: '张三', avatar: null, status: 'unknown' }
      }).success
    ).toBe(false);
  });

  it('app/dataset item：sourceMember.status null 通过（缺成员占位）', () => {
    const appItem = {
      _id: oid(),
      parentId: null,
      tmbId: oid(),
      name: 'A',
      avatar: '',
      intro: '',
      type: AppTypeEnum.workflow,
      updateTime: new Date(),
      pluginData: {},
      permission: appPermission,
      sourceMember: { name: '未知成员', avatar: null, status: null }
    };
    expect(ListAppV2ItemSchema.safeParse(appItem).success).toBe(true);

    const datasetItem = {
      _id: oid(),
      tmbId: oid(),
      avatar: '',
      updateTime: new Date(),
      name: 'D',
      intro: '',
      type: DatasetTypeEnum.dataset,
      permission: appPermission,
      vectorModel,
      inheritPermission: true,
      sourceMember: { name: '未知成员', avatar: null, status: null }
    };
    expect(ListDatasetV2ItemSchema.safeParse(datasetItem).success).toBe(true);
  });
});
