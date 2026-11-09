import {
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamApikeyCreateRoleVal,
  TeamModelCreateRoleVal
} from '@fastgpt/global/support/permission/user/constant';
import { describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { ManageRoleVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { processAuditMetadata } from '@fastgpt/web/support/user/audit/processors';

const translations: Record<string, string> = {
  'app:type.Chat_Agent': '聊天助手',
  'account_team:dataset.common_dataset': '通用知识库',
  'account_team:member': '成员',
  'account_team:dataset_config_item_externalReadUrl': '外部预览地址'
};

describe('processAuditMetadata', () => {
  it.each([
    { parentResource: undefined, expectedParent: '-' },
    { parentResource: '', expectedParent: '' },
    { parentResource: 'account_team:父级/名称', expectedParent: 'account_team:父级/名称' }
  ])(
    'preserves resource names and handles parent $parentResource',
    ({ parentResource, expectedParent }) => {
      const t = vi.fn((key: string) => `translated:${key}`);
      const metadata = Object.freeze({
        name: 'account_team:用户',
        targetResource: 'app:目标/资源',
        parentResource
      });

      expect(
        processAuditMetadata({
          event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
          metadata,
          t
        })
      ).toEqual({
        name: 'account_team:用户',
        targetResource: 'app:目标/资源',
        parentResource: expectedParent
      });
      expect(t).not.toHaveBeenCalled();
      expect(metadata.parentResource).toBe(parentResource);
    }
  );

  it('formats export ranges as local date times without changing stored metadata', () => {
    const metadata = Object.freeze({
      dateStart: new Date(2026, 10, 2).toISOString(),
      dateEnd: new Date(2026, 10, 8, 23, 59, 59, 999).toISOString(),
      tmbIds: 'all',
      events: 'all',
      total: '280'
    });
    expect(
      processAuditMetadata({
        event: AuditEventEnum.EXPORT_AUDIT_LOGS,
        metadata,
        t: () => '全部'
      })
    ).toEqual({
      dateStart: '2026-11-02 00:00:00',
      dateEnd: '2026-11-08 23:59:59',
      tmbIds: '全部',
      events: '全部',
      total: '280'
    });
  });

  it.each([undefined, '', 'invalid-date'])(
    'preserves unavailable historical export dates: %s',
    (value) => {
      expect(
        processAuditMetadata({
          event: AuditEventEnum.EXPORT_AUDIT_LOGS,
          metadata: {
            dateStart: value,
            dateEnd: value,
            total: '',
            tmbIds: 'member-id',
            events: 'LOGIN'
          },
          t: (key) => key
        })
      ).toMatchObject({
        dateStart: value,
        dateEnd: value,
        total: '-',
        tmbIds: 'member-id',
        events: 'LOGIN'
      });
    }
  );

  it.each([
    { labels: ['account_team:member', 'app:type.Chat_Agent'] },
    { labels: 'account_team:member,app:type.Chat_Agent' }
  ])('translates historical field label representations: $labels', ({ labels: newItemNames }) => {
    const t = (key: string) => translations[key] ?? key;

    expect(
      processAuditMetadata({
        event: AuditEventEnum.CREATE_APP,
        metadata: {
          name: '张三',
          appType: 'app:type.Chat_Agent',
          newItemNames
        },
        t
      })
    ).toEqual({ name: '张三', appType: '聊天助手', newItemNames: '成员,聊天助手' });
  });

  it.each([
    {
      event: AuditEventEnum.UPDATE_APP_COLLABORATOR,
      typeKey: 'appType',
      typeValue: 'app:type.Chat_Agent',
      expectedType: '聊天助手'
    },
    {
      event: AuditEventEnum.UPDATE_DATASET_COLLABORATOR,
      typeKey: 'datasetType',
      typeValue: 'account_team:dataset.common_dataset',
      expectedType: '通用知识库'
    }
  ])(
    'keeps translations and permission markers for $event',
    ({ event, typeKey, typeValue, expectedType }) => {
      const t = (key: string) => translations[key] ?? key;

      for (const [role, read, write, manage] of [
        [0, '✘', '✘', '✘'],
        [ReadRoleVal, '✔', '✘', '✘'],
        [ManageRoleVal, '✔', '✔', '✔']
      ]) {
        expect(
          processAuditMetadata({
            event,
            metadata: { [typeKey]: typeValue, permission: String(role) },
            t
          })
        ).toEqual({
          [typeKey]: expectedType,
          permission: String(role),
          readPermission: read,
          writePermission: write,
          managePermission: manage
        });
      }
    }
  );

  it.each([
    { role: ReadRoleVal, marker: '✘' },
    {
      role:
        ManageRoleVal |
        TeamAppCreateRoleVal |
        TeamDatasetCreateRoleVal |
        TeamApikeyCreateRoleVal |
        TeamModelCreateRoleVal,
      marker: '✔'
    }
  ])('keeps translated team labels and permission markers for role $role', ({ role, marker }) => {
    const t = (key: string) => translations[key] ?? key;

    expect(
      processAuditMetadata({
        event: AuditEventEnum.ASSIGN_PERMISSION,
        metadata: { objectName: 'account_team:member', permission: String(role) },
        t
      })
    ).toMatchObject({
      objectName: '成员',
      permission: String(role),
      manage: marker,
      appCreate: marker,
      datasetCreate: marker,
      apiKeyCreate: marker,
      modelCreate: marker
    });
  });

  it('passes raw metadata to dataset configuration processors and translates only the field label', () => {
    const t = vi.fn((key: string) => translations[key] ?? `translated:${key}`);

    expect(
      processAuditMetadata({
        event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE,
        metadata: {
          name: 'account_team:用户',
          datasetName: '知识库:产品手册',
          changeItem: 'account_team:dataset_config_item_externalReadUrl',
          oldValue: 'https://old.example.com/read',
          newValue: 'https://new.example.com/read'
        },
        t
      })
    ).toEqual({
      name: 'account_team:用户',
      datasetName: '知识库:产品手册',
      changeItem: '外部预览地址',
      oldValue: 'https://old.example.com/read',
      newValue: 'https://new.example.com/read'
    });
    expect(t).toHaveBeenCalledExactlyOnceWith('account_team:dataset_config_item_externalReadUrl');
  });
});
