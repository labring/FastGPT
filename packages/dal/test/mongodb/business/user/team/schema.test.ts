import { Mongoose } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  MemberGroupDocumentSchema,
  getMemberGroupModel,
  OrgDocumentSchema,
  getOrgModel,
  TeamDocumentSchema,
  getTeamModel,
  TeamMemberDocumentSchema,
  getTeamMemberModel
} from '../../../../../mongodb/business/support/user/team';
import {
  TmpDataDocumentSchema,
  getTmpDataModel
} from '../../../../../mongodb/business/support/user/verification';

describe('TeamDocumentSchema', () => {
  it('matches production defaults and declares production indexes', () => {
    const TeamModel = getTeamModel(new Mongoose());
    const document = new TeamModel({ name: 'My Team', ownerId: '507f1f77bcf86cd799439011' });

    expect(document.avatar).toBe('/icon/logo.svg');
    expect(document.externalWorkflowVariables).toEqual({});
    expect(TeamDocumentSchema.indexes()).toEqual([
      [{ name: 1 }, { background: true }],
      [{ ownerId: 1 }, { background: true }],
      [{ 'meta.wecom.corpId': 1 }, { sparse: true, unique: true, background: true }]
    ]);
  });
});

describe('TeamMemberDocumentSchema', () => {
  it('matches production defaults and declares production indexes', () => {
    const TeamMemberModel = getTeamMemberModel(new Mongoose());
    const document = new TeamMemberModel({
      teamId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439011'
    });

    expect(document.name).toBe('Member');
    expect(typeof document.avatar).toBe('string');
    expect(document.createTime).toBeInstanceOf(Date);
    expect(TeamMemberDocumentSchema.indexes()).toEqual([
      [{ teamId: 1 }, { background: true }],
      [{ userId: 1 }, { background: true }]
    ]);
  });
});

describe('MemberGroupDocumentSchema', () => {
  it('declares the production unique team+name index', () => {
    expect(MemberGroupDocumentSchema.indexes()).toEqual([
      [
        { teamId: 1, name: 1 },
        { unique: true, background: true }
      ]
    ]);
  });
});

describe('OrgDocumentSchema', () => {
  it('declares production indexes', () => {
    expect(OrgDocumentSchema.indexes()).toEqual([
      [{ teamId: 1, path: 1 }, { background: true }],
      [
        { teamId: 1, pathId: 1 },
        { unique: true, background: true }
      ]
    ]);
  });
});

describe('TmpDataDocumentSchema', () => {
  it('matches production shape and declares TTL indexes', () => {
    const TmpDataModel = getTmpDataModel(new Mongoose());
    const document = new TmpDataModel({
      dataId: 'verification:v1:login:password:user@example.com',
      expireAt: new Date()
    });

    expect(document.data).toBeUndefined();
    expect(TmpDataDocumentSchema.indexes()).toEqual([
      [{ dataId: 1 }, { unique: true, background: true }],
      [{ dataId: -1 }, { background: true }],
      [{ expireAt: -1 }, { expireAfterSeconds: 5, background: true }]
    ]);
  });
});
