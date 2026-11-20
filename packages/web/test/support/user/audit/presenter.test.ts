import { describe, expect, it } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { AuditResourceTypeEnum } from '@fastgpt/global/support/user/audit/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ManageRoleVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import {
  formatAuditResourcesText,
  formatAuditSummary,
  resolveAuditResourceAvatar,
  resolveAuditResourceHref,
  resolveAuditResources
} from '@fastgpt/web/support/user/audit/presenter';

const t = (key: string, options?: Record<string, any>) => {
  if (!options) return key;
  const pairs = Object.entries(options)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
  return `${key}(${pairs})`;
};

describe('audit presenter resources', () => {
  const id = '68ad85a7463006c963799a05';
  const parentId = '68ad85a7463006c963799a06';

  it('resolves hrefs only for active routable entities and omits them when deleted or unroutable', () => {
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.app, id })).toBe(
      `/app/detail?appId=${id}`
    );
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.tool, id })).toBe(
      `/app/detail?appId=${id}`
    );
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.appFolder, id })).toBe(
      `/dashboard/agent?parentId=${id}`
    );
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.toolFolder, id })).toBe(
      `/dashboard/tool?parentId=${id}`
    );
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.dataset, id })).toBe(
      `/dataset/detail?datasetId=${id}`
    );
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.datasetFolder, id })).toBe(
      `/dataset/list?parentId=${id}`
    );
    expect(
      resolveAuditResourceHref({
        type: AuditResourceTypeEnum.collection,
        id,
        parentId
      })
    ).toBe(`/dataset/detail?datasetId=${parentId}&currentTab=dataCard&collectionId=${id}`);
    expect(
      resolveAuditResourceHref({
        type: AuditResourceTypeEnum.collection,
        id,
        datasetId: parentId
      })
    ).toBe(`/dataset/detail?datasetId=${parentId}&currentTab=dataCard&collectionId=${id}`);
    expect(
      resolveAuditResourceHref({
        type: AuditResourceTypeEnum.collectionFolder,
        id,
        parentId
      })
    ).toBe(`/dataset/detail?datasetId=${parentId}&currentTab=collectionCard&parentId=${id}`);
    expect(
      resolveAuditResourceHref({
        type: AuditResourceTypeEnum.collectionFolder,
        id,
        datasetId: parentId
      })
    ).toBe(`/dataset/detail?datasetId=${parentId}&currentTab=collectionCard&parentId=${id}`);
    expect(
      resolveAuditResourceHref({ type: AuditResourceTypeEnum.collection, id })
    ).toBeUndefined();
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.skill, id })).toBe(
      `/skill/detail?skillId=${id}`
    );
    expect(resolveAuditResourceHref({ type: AuditResourceTypeEnum.skillFolder, id })).toBe(
      `/dashboard/skill?parentId=${id}`
    );
    expect(
      resolveAuditResourceHref({ type: AuditResourceTypeEnum.app, id, deleted: true })
    ).toBeUndefined();
    for (const type of [
      AuditResourceTypeEnum.member,
      AuditResourceTypeEnum.department,
      AuditResourceTypeEnum.group,
      AuditResourceTypeEnum.team,
      AuditResourceTypeEnum.apiKey,
      AuditResourceTypeEnum.enterprise
    ]) {
      expect(resolveAuditResourceHref({ type, id, name: 'x' })).toBeUndefined();
    }
  });

  it('omits avatars for avatarless entity types and falls back to defaults for others', () => {
    expect(
      resolveAuditResourceAvatar({ type: AuditResourceTypeEnum.apiKey, name: 'Key' })
    ).toBeUndefined();
    expect(
      resolveAuditResourceAvatar({ type: AuditResourceTypeEnum.enterprise, name: 'Acme' })
    ).toBeUndefined();
    expect(resolveAuditResourceAvatar({ type: AuditResourceTypeEnum.app, name: 'Bot' })).toBe(
      'core/app/type/simpleFill'
    );
    expect(
      resolveAuditResourceAvatar({
        type: AuditResourceTypeEnum.app,
        name: 'Bot',
        avatar: '/custom.png'
      })
    ).toBe('/custom.png');
    expect(
      resolveAuditResourceAvatar({
        type: AuditResourceTypeEnum.collection,
        name: 'guide.pdf',
        collectionType: DatasetCollectionTypeEnum.file
      })
    ).toBeTruthy();
  });

  it('suppresses links on delete events and normalizes legacy resources and metadata fallbacks', () => {
    const deleted = resolveAuditResources({
      event: AuditEventEnum.DELETE_APP,
      resources: [{ type: AuditResourceTypeEnum.app, id, name: 'Gone App' }]
    });
    expect(deleted).toHaveLength(1);
    expect(deleted[0].href).toBeUndefined();
    expect(deleted[0].deleted).toBe(true);

    const legacyStored = resolveAuditResources({
      event: AuditEventEnum.CREATE_APP,
      resources: [{ appId: id, appType: AppTypeEnum.workflowTool }],
      metadata: { appName: 'Legacy Tool' }
    });
    expect(legacyStored[0]).toMatchObject({
      type: AuditResourceTypeEnum.tool,
      name: 'Legacy Tool',
      href: `/app/detail?appId=${id}`
    });

    const legacyMetadataOnly = resolveAuditResources({
      event: AuditEventEnum.KICK_OUT_TEAM,
      metadata: { memberName: 'Alice' }
    });
    expect(legacyMetadataOnly[0]).toMatchObject({
      type: AuditResourceTypeEnum.member,
      name: 'Alice'
    });
    expect(legacyMetadataOnly[0].href).toBeUndefined();

    expect(
      resolveAuditResources({
        event: AuditEventEnum.LOGIN,
        metadata: { name: 'Alice' }
      })
    ).toEqual([]);
    expect(formatAuditResourcesText([])).toBe('-');
    expect(formatAuditResourcesText(legacyStored)).toBe('Legacy Tool');
    expect(
      formatAuditResourcesText([
        { key: 'a', name: 'Prod Key' },
        { key: 'b', name: 'Chat Bot' }
      ])
    ).toBe('Prod Key\nChat Bot');
  });
});

describe('audit presenter summary', () => {
  it('returns "-" for action-only events without detail changes', () => {
    for (const event of [
      AuditEventEnum.LOGIN,
      AuditEventEnum.CREATE_APP,
      AuditEventEnum.SAVE_APP,
      AuditEventEnum.PUBLISH_APP,
      AuditEventEnum.CREATE_DATASET,
      AuditEventEnum.CREATE_API_KEY,
      AuditEventEnum.START_ENTERPRISE_AUTH,
      AuditEventEnum.CREATE_DEPARTMENT,
      AuditEventEnum.KICK_OUT_TEAM,
      AuditEventEnum.CHANGE_PASSWORD
    ]) {
      expect(
        formatAuditSummary({
          event,
          metadata: { name: 'Alice', appName: 'Bot', keyName: 'k' },
          t
        })
      ).toBe('-');
    }
  });

  it('formats deleted resource name and id line by line for resource deletion events', () => {
    expect(
      formatAuditSummary({
        event: AuditEventEnum.DELETE_APP,
        resources: [
          {
            type: AuditResourceTypeEnum.app,
            id: '68ad85a7463006c963799a01',
            name: '客服助手',
            deleted: true
          }
        ],
        metadata: { appName: '客服助手' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_name(name=客服助手)',
        'account_team:audit_detail_resource_id(id=68ad85a7463006c963799a01)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.DELETE_APP,
        metadata: { appName: '旧应用' },
        t
      })
    ).toBe('account_team:audit_detail_resource_name(name=旧应用)');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.DELETE_API_KEY,
        resources: [
          {
            type: AuditResourceTypeEnum.apiKey,
            id: '68ad85a7463006c963799f01',
            name: '线上生产 Key',
            deleted: true
          },
          {
            type: AuditResourceTypeEnum.app,
            id: '68ad85a7463006c963799a01',
            name: '客服助手'
          }
        ],
        metadata: { keyName: '线上生产 Key', keyId: '68ad85a7463006c963799f01' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_name(name=线上生产 Key)',
        'account_team:audit_detail_resource_id(id=68ad85a7463006c963799f01)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.DELETE_COLLECTION,
        resources: [
          {
            type: AuditResourceTypeEnum.collection,
            id: '68ad85a7463006c963799c01',
            parentId: '68ad85a7463006c963799b01',
            name: '接入指南.pdf',
            deleted: true
          },
          {
            type: AuditResourceTypeEnum.collection,
            id: '68ad85a7463006c963799c02',
            parentId: '68ad85a7463006c963799b01',
            name: 'FAQ.docx',
            deleted: true
          }
        ],
        metadata: { datasetName: '产品手册', collectionName: '接入指南.pdf' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_collection_dataset(datasetName=产品手册)',
        'account_team:audit_detail_resource_name(name=接入指南.pdf)',
        'account_team:audit_detail_resource_id(id=68ad85a7463006c963799c01)',
        'account_team:audit_detail_resource_name(name=FAQ.docx)',
        'account_team:audit_detail_resource_id(id=68ad85a7463006c963799c02)'
      ].join('\n')
    );
  });

  it('formats concise change details for rename, move, ownership, collaborators, and dataset configs', () => {
    expect(
      formatAuditSummary({
        event: AuditEventEnum.CHANGE_MEMBER_NAME,
        metadata: { memberName: 'Old', newName: 'New' },
        t
      })
    ).toBe('account_team:audit_detail_rename(newName=New|oldName=Old)');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.CHANGE_DEPARTMENT,
        metadata: { departmentName: 'Dept', oldName: 'OldDept', newName: 'NewDept' },
        t
      })
    ).toBe('account_team:audit_detail_rename(newName=NewDept|oldName=OldDept)');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.CHANGE_DEPARTMENT,
        metadata: { departmentName: 'Dept' },
        t
      })
    ).toBe('-');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.CHANGE_DEPARTMENT,
        metadata: {
          departmentName: 'NewDept',
          newItemNames: ['common:name', 'common:Intro', 'account_team:dataset_config_item_avatar'],
          newItemValues: ['NewDept', 'Core infra', '']
        },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_update_fields(newItemNames=common:name|newItemValues=NewDept)',
        'account_team:audit_detail_update_fields(newItemNames=common:Intro|newItemValues=Core infra)',
        'account_team:audit_detail_update_fields(newItemNames=account_team:dataset_config_item_avatar|newItemValues=-)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.UPDATE_APP_INFO,
        metadata: {
          appName: 'Bot',
          newItemNames: ['common:name', 'common:Intro', 'account_team:dataset_config_item_avatar'],
          newItemValues: ['客服助手', '处理售后, 工单分流', '']
        },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_update_fields(newItemNames=common:name|newItemValues=客服助手)',
        'account_team:audit_detail_update_fields(newItemNames=common:Intro|newItemValues=处理售后, 工单分流)',
        'account_team:audit_detail_update_fields(newItemNames=account_team:dataset_config_item_avatar|newItemValues=-)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.UPDATE_SKILL,
        metadata: {
          skillName: 'SQL',
          newItemNames: ['common:name', 'common:Intro'],
          newItemValues: ['SQL 生成', '']
        },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_update_fields(newItemNames=common:name|newItemValues=SQL 生成)',
        'account_team:audit_detail_update_fields(newItemNames=common:Intro|newItemValues=-)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.RELOCATE_DEPARTMENT,
        metadata: {
          departmentName: 'Dept X',
          targetDepartmentName: 'Dept B'
        },
        t
      })
    ).toBe('account_team:audit_detail_move_to(target=Dept B)');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.MOVE_APP,
        metadata: { appName: 'Bot', targetFolderName: 'Root' },
        t
      })
    ).toBe('account_team:audit_detail_move_to(target=Root)');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.UPDATE_SKILL_COLLABORATOR,
        metadata: {
          skillName: 'Search',
          tmbList: ['Bob'],
          orgList: [],
          groupList: [],
          permission: String(ReadRoleVal)
        },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_collaborator_member(value=Bob)',
        'account_team:audit_detail_collaborator_permissions(managePermission=✘|readPermission=✔|writePermission=✘)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.UPDATE_APP_COLLABORATOR,
        metadata: {
          appName: 'Bot',
          tmbList: ['Bob'],
          orgList: [],
          groupList: [],
          permission: String(ManageRoleVal)
        },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_collaborator_member(value=Bob)',
        'account_team:audit_detail_collaborator_permissions(managePermission=✔|readPermission=✔|writePermission=✔)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE,
        metadata: {
          datasetName: 'KB',
          changeItem: 'account_team:dataset_config_item_name',
          oldValue: 'A',
          newValue: 'B'
        },
        t
      })
    ).toBe(
      'account_team:audit_detail_dataset_config(changeItem=account_team:dataset_config_item_name|newValue=B|oldValue=A)'
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.CREATE_COLLECTION,
        metadata: { collectionName: 'doc.pdf', datasetName: 'KB' },
        t
      })
    ).toBe('account_team:audit_detail_collection_dataset(datasetName=KB)');

    expect(
      formatAuditSummary({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [
          { datasetId: '68ad85a7463006c963799e10' },
          { collectionId: '68ad85a7463006c963799e11' }
        ],
        metadata: { targetResource: '产品手册.pdf', parentResource: '知识库 A' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_type(type=account_team:audit_resource_type_collection)',
        'account_team:audit_detail_inherit_parent(parentResource=知识库 A)'
      ].join('\n')
    );
    expect(
      resolveAuditResources({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [
          { datasetId: '68ad85a7463006c963799e10' },
          { collectionId: '68ad85a7463006c963799e11' }
        ],
        metadata: { targetResource: '产品手册.pdf', parentResource: '知识库 A' }
      })
    ).toEqual([
      expect.objectContaining({
        type: AuditResourceTypeEnum.collection,
        name: '产品手册.pdf',
        href: '/dataset/detail?datasetId=68ad85a7463006c963799e10&currentTab=dataCard&collectionId=68ad85a7463006c963799e11'
      })
    ]);

    expect(
      formatAuditSummary({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [
          {
            type: AuditResourceTypeEnum.app,
            id: '68ad85a7463006c963799a01',
            name: '客服助手'
          }
        ],
        metadata: { targetResource: '客服助手', parentResource: '客服应用目录' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_type(type=account_team:audit_resource_type_app)',
        'account_team:audit_detail_inherit_parent(parentResource=客服应用目录)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.ASSIGN_PERMISSION,
        resources: [
          {
            type: AuditResourceTypeEnum.department,
            id: '68ad85a7463006c963799e02',
            name: '基础架构部'
          }
        ],
        metadata: { objectName: '基础架构部', permission: '0' },
        t
      })
    ).toContain(
      'account_team:audit_detail_resource_type(type=account_team:audit_resource_type_department)\n'
    );
  });

  it('keeps invitation link out of resources and renders link name in summary', () => {
    for (const event of [AuditEventEnum.CREATE_INVITATION_LINK, AuditEventEnum.JOIN_TEAM]) {
      expect(
        resolveAuditResources({
          event,
          resources: [
            {
              type: 'invitationLink',
              id: 'link-1',
              name: '2026 研发部邀请'
            }
          ],
          metadata: { link: '2026 研发部邀请' }
        })
      ).toEqual([]);

      expect(
        formatAuditSummary({
          event,
          metadata: { link: '2026 研发部邀请' },
          t
        })
      ).toBe('account_team:audit_detail_invitation_link(link=2026 研发部邀请)');
    }
  });

  it('uses currentType for navigation link while keeping snapshot type in summary', () => {
    const folderId = '68ad85a7463006c963799f01';
    const resource = {
      type: AuditResourceTypeEnum.appFolder,
      currentType: AuditResourceTypeEnum.toolFolder,
      id: folderId,
      name: '共享目录'
    };

    expect(
      resolveAuditResources({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [resource],
        metadata: { targetResource: '共享目录', parentResource: '根目录' }
      })
    ).toEqual([
      expect.objectContaining({
        type: AuditResourceTypeEnum.appFolder,
        name: '共享目录',
        href: `/dashboard/tool?parentId=${folderId}`
      })
    ]);

    expect(
      formatAuditSummary({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [resource],
        metadata: { targetResource: '共享目录', parentResource: '根目录' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_type(type=account_team:audit_resource_type_appFolder)',
        'account_team:audit_detail_inherit_parent(parentResource=根目录)'
      ].join('\n')
    );

    // 遇到未识别的 currentType 时保留有效快照，并回退到快照类型构造链接。
    expect(
      resolveAuditResources({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [
          {
            type: AuditResourceTypeEnum.appFolder,
            currentType: 'futureResourceType',
            id: folderId,
            name: '共享目录'
          }
        ],
        metadata: { targetResource: '共享目录', parentResource: '根目录' }
      })
    ).toEqual([
      expect.objectContaining({
        type: AuditResourceTypeEnum.appFolder,
        name: '共享目录',
        href: `/dashboard/agent?parentId=${folderId}`
      })
    ]);
  });

  it('formats structured summaries and resources for dataset collection audit events', () => {
    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_CREATE,
        metadata: {
          collectionName: 'API 设计.pdf',
          objectType: 'common:core.dataset.file',
          location: '产品手册/技术文档'
        },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_type(type=common:core.dataset.file)',
        'account_team:audit_detail_collection_location(location=产品手册/技术文档)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_RENAME,
        metadata: {
          oldName: '旧名称',
          newName: '新名称'
        },
        t
      })
    ).toBe('account_team:audit_detail_rename(newName=新名称|oldName=旧名称)');

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_MOVE,
        metadata: {
          oldPath: '产品手册/旧目录/API 设计.pdf',
          newPath: '产品手册/新目录/API 设计.pdf'
        },
        t
      })
    ).toBe(
      'account_team:audit_detail_rename(newName=产品手册/新目录/API 设计.pdf|oldName=产品手册/旧目录/API 设计.pdf)'
    );

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
        metadata: { tagName: '已审核' },
        t
      })
    ).toBe('account_team:audit_detail_dataset_tag(tagName=已审核)');

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME,
        metadata: {
          parentResource: '技术文档'
        },
        t
      })
    ).toBe('account_team:audit_detail_inherit_parent(parentResource=技术文档)');

    for (const event of [
      DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE,
      DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE,
      DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ,
      DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT,
      DatasetAuditEventEnum.DATASET_COLLECTION_SYNC
    ]) {
      expect(
        formatAuditSummary({
          event,
          metadata: {},
          t
        })
      ).toBe('-');
      expect(
        resolveAuditResources({
          event,
          metadata: { datasetName: '产品手册', collectionName: 'API 设计.pdf' }
        })
      ).toEqual([
        expect.objectContaining({
          type: AuditResourceTypeEnum.collection,
          name: 'API 设计.pdf'
        })
      ]);
    }
  });

  it('places live datasetName or deleted dataset notice first in collection detail summary while keeping resource column collection-only', () => {
    const liveCollectionResource = {
      type: AuditResourceTypeEnum.collection,
      id: '68ad85a7463006c963799c01',
      datasetId: '68ad85a7463006c963799b01',
      name: '接入指南.pdf',
      datasetName: '产品手册（最新）'
    };
    const deletedDatasetCollectionResource = {
      type: AuditResourceTypeEnum.collection,
      id: '68ad85a7463006c963799c01',
      datasetId: '68ad85a7463006c963799b01',
      name: '接入指南.pdf',
      deleted: true,
      datasetDeleted: true
    };

    const presented = resolveAuditResources({
      event: DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
      resources: [liveCollectionResource]
    });
    expect(presented).toHaveLength(1);
    expect(presented[0]).toMatchObject({
      type: AuditResourceTypeEnum.collection,
      name: '接入指南.pdf',
      href: '/dataset/detail?datasetId=68ad85a7463006c963799b01&currentTab=dataCard&collectionId=68ad85a7463006c963799c01'
    });

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
        resources: [liveCollectionResource],
        t
      })
    ).toBe('account_team:audit_detail_collection_dataset(datasetName=产品手册（最新）)');

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
        resources: [deletedDatasetCollectionResource],
        t
      })
    ).toBe(
      'account_team:audit_detail_collection_dataset(datasetName=account_team:audit_detail_dataset_deleted)'
    );

    expect(
      formatAuditSummary({
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
        resources: [liveCollectionResource],
        metadata: { tagName: '已审核' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_collection_dataset(datasetName=产品手册（最新）)',
        'account_team:audit_detail_dataset_tag(tagName=已审核)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.DELETE_COLLECTION,
        resources: [{ ...liveCollectionResource, deleted: true }],
        metadata: { collectionName: '接入指南.pdf' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_collection_dataset(datasetName=产品手册（最新）)',
        'account_team:audit_detail_resource_name(name=接入指南.pdf)',
        'account_team:audit_detail_resource_id(id=68ad85a7463006c963799c01)'
      ].join('\n')
    );

    expect(
      formatAuditSummary({
        event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
        resources: [liveCollectionResource],
        metadata: { parentResource: '产品手册（最新）' },
        t
      })
    ).toBe(
      [
        'account_team:audit_detail_resource_type(type=account_team:audit_resource_type_collection)',
        'account_team:audit_detail_collection_dataset(datasetName=产品手册（最新）)',
        'account_team:audit_detail_inherit_parent(parentResource=产品手册（最新）)'
      ].join('\n')
    );

    const deletedNamedDash = resolveAuditResources({
      event: AuditEventEnum.DELETE_DATASET,
      resources: [
        {
          type: AuditResourceTypeEnum.dataset,
          id: '68ad85a7463006c963799b02',
          name: '-',
          deleted: true
        }
      ]
    });
    expect(deletedNamedDash[0].name).toBe('-');
    expect(deletedNamedDash[0].nameMissing).toBeUndefined();
    expect(formatAuditResourcesText(deletedNamedDash, t)).toBe('-');
  });
});
