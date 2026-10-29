import { describe, expect, it } from 'vitest';
import { buildCollectionUpdateAuditChanges } from '@fastgpt/service/core/dataset/audit/collection';

const collection = { name: 'source:file', forbid: false };

describe('buildCollectionUpdateAuditChanges', () => {
  it('skips omitted and unchanged attributes', () => {
    expect(buildCollectionUpdateAuditChanges({ collection, update: {} })).toEqual([]);
    expect(
      buildCollectionUpdateAuditChanges({
        collection,
        update: { name: collection.name, forbid: false }
      })
    ).toEqual([]);
    expect(buildCollectionUpdateAuditChanges({ collection, update: { name: '' } })).toEqual([]);
  });

  it('keeps separate rename, status and move snapshots in one update', () => {
    expect(
      buildCollectionUpdateAuditChanges({
        collection,
        update: { name: 'target:file', forbid: true },
        move: { oldPath: 'docs/source/source:file', newPath: 'docs/target/target:file' }
      })
    ).toEqual([
      {
        action: 'rename',
        changeItem: 'account_team:dataset_content_change_item_name',
        oldValue: 'source:file',
        newValue: 'target:file'
      },
      {
        action: 'disable',
        changeItem: 'account_team:dataset_content_change_item_status',
        oldValue: 'account_team:dataset_content_status_enabled',
        newValue: 'account_team:dataset_content_status_disabled'
      },
      {
        action: 'move',
        changeItem: 'account_team:dataset_content_change_item_location',
        oldValue: 'docs/source/source:file',
        newValue: 'docs/target/target:file'
      }
    ]);
  });

  it('records enabling a disabled collection', () => {
    expect(
      buildCollectionUpdateAuditChanges({
        collection: { ...collection, forbid: true },
        update: { forbid: false }
      })
    ).toEqual([
      {
        action: 'enable',
        changeItem: 'account_team:dataset_content_change_item_status',
        oldValue: 'account_team:dataset_content_status_disabled',
        newValue: 'account_team:dataset_content_status_enabled'
      }
    ]);
  });
});
