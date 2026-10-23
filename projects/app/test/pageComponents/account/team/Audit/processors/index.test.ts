import { describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { ManageRoleVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { processAuditMetadata } from '@/pageComponents/account/team/Audit/processors';

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

  it('uses the default translations for events without a custom processor', () => {
    const t = (key: string) => translations[key] ?? key;

    expect(
      processAuditMetadata({
        event: AuditEventEnum.CREATE_APP,
        metadata: {
          name: '张三',
          appType: 'app:type.Chat_Agent',
          newItemNames: ['account_team:member', 'app:type.Chat_Agent']
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

      expect(
        processAuditMetadata({
          event,
          metadata: { [typeKey]: typeValue, permission: String(ReadRoleVal) },
          t
        })
      ).toEqual({
        [typeKey]: expectedType,
        permission: String(ReadRoleVal),
        readPermission: '✔',
        writePermission: '✘',
        managePermission: '✘'
      });
    }
  );

  it('keeps translations and team permission markers for permission assignments', () => {
    const t = (key: string) => translations[key] ?? key;

    expect(
      processAuditMetadata({
        event: AuditEventEnum.ASSIGN_PERMISSION,
        metadata: { objectName: 'account_team:member', permission: String(ManageRoleVal) },
        t
      })
    ).toMatchObject({ objectName: '成员', permission: String(ManageRoleVal), manage: '✔' });
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
