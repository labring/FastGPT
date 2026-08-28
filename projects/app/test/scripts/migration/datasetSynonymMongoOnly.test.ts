import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  hashPreparedLegacyMappings,
  isDatasetSynonymConfigMigrated,
  prepareLegacySynonymMigration
} from '../../../scripts/migration/datasetSynonymMongoOnly';
import {
  DatasetSynonymMappingSourceEnum,
  DatasetSynonymSchemaVersion
} from '@fastgpt/global/core/dataset/synonym';

const configId = new Types.ObjectId();
const teamId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const createConfig = () => ({ _id: configId, teamId, datasetId });
const createMapping = ({
  id = new Types.ObjectId(),
  standardizedTerm = '退款',
  synonymTerms = ['退钱']
}: {
  id?: Types.ObjectId;
  standardizedTerm?: string;
  synonymTerms?: string[];
} = {}) => ({
  _id: id,
  teamId,
  datasetId,
  synonymFileId: configId,
  standardizedTerm,
  synonymTerms,
  createdTime: new Date('2024-01-01T00:00:00.000Z'),
  updatedTime: new Date('2024-01-02T00:00:00.000Z')
});

describe('prepareLegacySynonymMigration', () => {
  it('recognizes current runtime configs so migration reruns skip them', () => {
    expect(
      isDatasetSynonymConfigMigrated({
        ...createConfig(),
        schemaVersion: DatasetSynonymSchemaVersion,
        version: 3,
        enabled: true
      })
    ).toBe(true);
    expect(isDatasetSynonymConfigMigrated(createConfig())).toBe(false);
  });

  it('creates a deterministic version 1 plan from legacy fields', () => {
    const mapping = createMapping();
    const first = prepareLegacySynonymMigration({ config: createConfig(), mappings: [mapping] });
    const second = prepareLegacySynonymMigration({ config: createConfig(), mappings: [mapping] });

    expect(first).toMatchObject({
      kind: 'ready',
      mappings: [
        {
          _id: mapping._id,
          logicalMappingId: mapping._id,
          fileVersion: 1,
          normalizedStandardizedTerm: '退款',
          normalizedSynonymTerms: ['退钱'],
          source: DatasetSynonymMappingSourceEnum.legacyMigration,
          createTime: new Date('2024-01-01T00:00:00.000Z'),
          updateTime: new Date('2024-01-02T00:00:00.000Z')
        }
      ]
    });
    expect(first.kind === 'ready' && second.kind === 'ready' && first.contentHash).toBe(
      second.kind === 'ready' ? second.contentHash : undefined
    );
    if (first.kind === 'ready') {
      expect(hashPreparedLegacyMappings(first.mappings)).toBe(first.contentHash);
    }
  });

  it('rejects normalized duplicate standards instead of merging documents', () => {
    const plan = prepareLegacySynonymMigration({
      config: createConfig(),
      mappings: [
        createMapping({ standardizedTerm: 'FastGPT', synonymTerms: ['FGPT'] }),
        createMapping({ standardizedTerm: 'fastgpt', synonymTerms: ['Fast GPT'] })
      ]
    });

    expect(plan).toEqual({
      kind: 'invalid',
      reason: '多个 legacy mapping 归一化后标准词重复'
    });
  });

  it('rejects cross-group term conflicts', () => {
    const plan = prepareLegacySynonymMigration({
      config: createConfig(),
      mappings: [
        createMapping({ standardizedTerm: 'A', synonymTerms: ['B'] }),
        createMapping({ standardizedTerm: 'B', synonymTerms: ['C'] })
      ]
    });

    expect(plan.kind).toBe('invalid');
    expect(plan.kind === 'invalid' ? plan.reason : '').toContain('冲突');
  });

  it('rejects mappings owned by another config', () => {
    const plan = prepareLegacySynonymMigration({
      config: createConfig(),
      mappings: [{ ...createMapping(), synonymFileId: new Types.ObjectId() }]
    });

    expect(plan.kind).toBe('invalid');
    expect(plan.kind === 'invalid' ? plan.reason : '').toContain('synonymFileId');
  });

  it('returns an empty plan without inventing a mapping version', () => {
    expect(prepareLegacySynonymMigration({ config: createConfig(), mappings: [] })).toEqual({
      kind: 'empty'
    });
  });
});
