import type {
  DatasetSynonymMappingType,
  NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { Types } from '../../../common/mongo';

export type PreparedSynonymMapping = NormalizedSynonymMappingType & {
  logicalMappingId: string;
};

export type DatasetSynonymMappingDiff = {
  added: PreparedSynonymMapping[];
  removed: DatasetSynonymMappingType[];
  changed: Array<{
    oldMapping: DatasetSynonymMappingType;
    newMapping: PreparedSynonymMapping;
  }>;
  unchanged: Array<{
    oldMapping: DatasetSynonymMappingType;
    newMapping: PreparedSynonymMapping;
  }>;
  affectedLogicalMappingIds: string[];
  affectedTerms: string[];
};

const getMappingTerms = (
  mapping:
    | Pick<DatasetSynonymMappingType, 'standardizedTerm' | 'synonymTerms'>
    | PreparedSynonymMapping
) => [mapping.standardizedTerm, ...mapping.synonymTerms];

/**
 * 比较 active 快照与新文件。身份键为 normalizedStandardizedTerm；changed 和
 * unchanged 继承旧 logicalMappingId，只有 added 分配新 ID，保证引用跨版本稳定。
 */
export const calculateSynonymMappingDiff = ({
  activeMappings,
  newMappings,
  createLogicalMappingId = () => new Types.ObjectId().toString()
}: {
  activeMappings: DatasetSynonymMappingType[];
  newMappings: NormalizedSynonymMappingType[];
  createLogicalMappingId?: () => string;
}): DatasetSynonymMappingDiff => {
  const activeMap = new Map(
    activeMappings.map((mapping) => [mapping.normalizedStandardizedTerm, mapping])
  );
  const added: PreparedSynonymMapping[] = [];
  const changed: DatasetSynonymMappingDiff['changed'] = [];
  const unchanged: DatasetSynonymMappingDiff['unchanged'] = [];

  for (const mapping of newMappings) {
    const oldMapping = activeMap.get(mapping.normalizedStandardizedTerm);
    if (!oldMapping) {
      added.push({ ...mapping, logicalMappingId: createLogicalMappingId() });
      continue;
    }

    activeMap.delete(mapping.normalizedStandardizedTerm);
    const newMapping = { ...mapping, logicalMappingId: String(oldMapping.logicalMappingId) };
    if (oldMapping.fingerprint === mapping.fingerprint) {
      unchanged.push({ oldMapping, newMapping });
    } else {
      changed.push({ oldMapping, newMapping });
    }
  }

  const removed = [...activeMap.values()];
  const affectedLogicalMappingIds = [
    ...added.map((mapping) => mapping.logicalMappingId),
    ...changed.map(({ oldMapping }) => String(oldMapping.logicalMappingId)),
    ...removed.map((mapping) => String(mapping.logicalMappingId))
  ].filter((id, index, ids) => ids.indexOf(id) === index);
  const affectedTerms = [
    ...added.flatMap(getMappingTerms),
    ...changed.flatMap(({ oldMapping, newMapping }) => [
      ...getMappingTerms(oldMapping),
      ...getMappingTerms(newMapping)
    ]),
    ...removed.flatMap(getMappingTerms)
  ].filter((term, index, terms) => terms.indexOf(term) === index);

  return {
    added,
    removed,
    changed,
    unchanged,
    affectedLogicalMappingIds,
    affectedTerms
  };
};

/** 将 diff 合成为完整 pendingVersion 快照，按标准词匹配键稳定排序。 */
export const getPendingSynonymMappings = (diff: DatasetSynonymMappingDiff) => {
  return [
    ...diff.added,
    ...diff.changed.map(({ newMapping }) => newMapping),
    ...diff.unchanged.map(({ newMapping }) => newMapping)
  ].sort((a, b) => a.normalizedStandardizedTerm.localeCompare(b.normalizedStandardizedTerm));
};
