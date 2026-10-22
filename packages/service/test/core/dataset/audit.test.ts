import { describe, expect, it } from 'vitest';
import {
  DatasetAuditEventEnum,
  DatasetConfigAuditItemEnum
} from '@fastgpt/global/core/dataset/constants';
import { AuditEventEnum, TeamAuditEventList } from '@fastgpt/global/support/user/audit/constants';
import { auditLogMap } from '@fastgpt/web/support/user/audit/constants';
import {
  buildDatasetConfigAuditChanges,
  stringifyDatasetConfigAuditValue
} from '@fastgpt/service/core/dataset/audit';

describe('dataset level audit events', () => {
  it('keeps every dataset event registered in the team audit event list', () => {
    // 知识库事件与成员事件共用同一个 operationLogs 集合与同一套 OpenAPI 校验；
    // 事件漏登记会表现为「能写入但列表接口读不出」，因此这里做全集对齐断言。
    for (const event of Object.values(DatasetAuditEventEnum)) {
      expect(TeamAuditEventList).toContain(event);
      expect(auditLogMap[event]).toBeDefined();
    }
  });

  it('uses dot-delimited dataset, resource, and action segments', () => {
    for (const event of Object.values(DatasetAuditEventEnum)) {
      expect(event).toMatch(/^dataset(?:\.[a-z]+){2,3}$/);
    }
  });

  it('does not redefine collection CRUD or tag events', () => {
    // `dataset.collection.training.retry` belongs to the merged training audit feature;
    // collection CRUD/tag events remain the responsibility of the collection audit feature.
    const values = Object.values(DatasetAuditEventEnum) as string[];
    expect(values.filter((value) => value.startsWith('dataset.collection.')).sort()).toEqual([
      DatasetAuditEventEnum.DATASET_COLLECTION_TRAINING_RETRY
    ]);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the deprecated dataset update event for historical log rendering', () => {
    expect(TeamAuditEventList).toContain(AuditEventEnum.UPDATE_DATASET);
    expect(auditLogMap[AuditEventEnum.UPDATE_DATASET]).toBeDefined();
  });
});

describe('buildDatasetConfigAuditChanges', () => {
  it('keeps scalar config items as a single readable entry', () => {
    const changes = buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.NAME,
      oldValue: 'old-name',
      newValue: 'new-name'
    });

    expect(changes).toEqual([
      {
        changeItem: 'account_team:dataset_config_item_name',
        oldValue: 'old-name',
        newValue: 'new-name'
      }
    ]);
  });

  it('skips config items whose value did not change', () => {
    expect(
      buildDatasetConfigAuditChanges({
        item: DatasetConfigAuditItemEnum.NAME,
        oldValue: 'same',
        newValue: 'same'
      })
    ).toEqual([]);
  });

  it('splits object config into changed leaf fields only', () => {
    const changes = buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.CHUNK_SETTINGS,
      oldValue: {
        trainingType: 'chunk',
        chunkSize: 1000,
        indexSize: 512,
        indexPrefixTitle: false
      },
      newValue: {
        trainingType: 'chunk',
        chunkSize: 1000,
        indexSize: 512,
        indexPrefixTitle: true
      }
    });

    // 只有真正变化的字段进日志，未变字段不应稀释可读性
    expect(changes).toEqual([
      {
        changeItem: 'account_team:dataset_config_item_chunkSettings · indexPrefixTitle',
        oldValue: '关闭',
        newValue: '开启'
      }
    ]);
  });

  it('drops mongoose subdocument ids from the audit output', () => {
    const changes = buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.WEBSITE_CONFIG,
      oldValue: {
        _id: { buffer: { 0: 106, 1: 208 } },
        url: 'https://doc.example.com/guide',
        selector: ''
      },
      newValue: {
        _id: { buffer: { 0: 106, 1: 208 } },
        url: 'https://doc.example.com/guide',
        selector: ''
      }
    });

    // 未变化的对象不应产生任何日志，且 `_id` 不能出现在展示文本里
    expect(changes).toEqual([]);
    expect(JSON.stringify(changes)).not.toContain('buffer');
  });

  it('reports nested field paths and removed fields', () => {
    const changes = buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.API_DATASET_SERVER,
      oldValue: {
        apiServer: { baseUrl: 'https://old.example.com', basePath: '/v1' },
        yuqueServer: { userId: 'u1' }
      },
      newValue: {
        apiServer: { baseUrl: 'https://new.example.com' }
      }
    });

    expect(changes.map((change) => change.changeItem)).toEqual([
      'account_team:dataset_config_item_apiDatasetServer · apiServer.baseUrl',
      'account_team:dataset_config_item_apiDatasetServer · apiServer.basePath',
      'account_team:dataset_config_item_apiDatasetServer · yuqueServer.userId'
    ]);
    expect(changes[0]).toMatchObject({
      oldValue: 'https://old.example.com',
      newValue: 'https://new.example.com'
    });
    // 被删除的配置项也要体现为「原值 → 空」
    expect(changes[1]).toMatchObject({ oldValue: '/v1', newValue: '-' });
    expect(changes[2]).toMatchObject({ oldValue: 'u1', newValue: '-' });
  });

  it('redacts credentials nested at any depth', () => {
    const changes = buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.API_DATASET_SERVER,
      oldValue: undefined,
      newValue: {
        apiServer: { baseUrl: 'https://api.example.com', authorization: 'Bearer secret-token' }
      }
    });

    const serialized = JSON.stringify(changes);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).toContain('[REDACTED]');
    // 保留字段路径，能看出「凭据被改过」，但不泄漏内容
    expect(changes.map((change) => change.changeItem)).toEqual(
      expect.arrayContaining([
        'account_team:dataset_config_item_apiDatasetServer · apiServer.authorization'
      ])
    );
  });

  it('renders booleans and arrays without json noise', () => {
    expect(
      buildDatasetConfigAuditChanges({
        item: DatasetConfigAuditItemEnum.AUTO_SYNC,
        oldValue: false,
        newValue: true
      })
    ).toEqual([
      {
        changeItem: 'account_team:dataset_config_item_autoSync',
        oldValue: '关闭',
        newValue: '开启'
      }
    ]);
  });
});

describe('stringifyDatasetConfigAuditValue', () => {
  it('renders empty values as a dash so the log stays readable', () => {
    expect(stringifyDatasetConfigAuditValue({ value: undefined })).toBe('-');
    expect(stringifyDatasetConfigAuditValue({ value: null })).toBe('-');
    expect(stringifyDatasetConfigAuditValue({ value: '' })).toBe('-');
  });

  it('keeps plain strings verbatim instead of quoting them', () => {
    expect(stringifyDatasetConfigAuditValue({ value: 'new name' })).toBe('new name');
  });

  it('never emits mongoose subdocument ids', () => {
    expect(
      stringifyDatasetConfigAuditValue({
        value: { _id: { buffer: { 0: 1 } }, url: 'https://example.com' }
      })
    ).toBe('{"url":"https://example.com"}');
  });
});
