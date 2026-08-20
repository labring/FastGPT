import {
  DatasetSynonymMappingSourceEnum,
  type DatasetSynonymMappingType,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import {
  calculateSynonymMappingDiff,
  getPendingSynonymMappings
} from '@fastgpt/service/core/dataset/synonym/service';
import { describe, expect, it } from 'vitest';

const baseId = '68ee0bd23d17260b7829b13';

const createActiveMapping = ({
  key,
  fingerprint,
  logicalMappingId,
  synonyms
}: {
  key: string;
  fingerprint: string;
  logicalMappingId: string;
  synonyms: string[];
}): DatasetSynonymMappingType => ({
  _id: `${baseId}1`,
  logicalMappingId,
  teamId: `${baseId}2`,
  datasetId: `${baseId}3`,
  synonymFileId: `${baseId}4`,
  fileVersion: 1,
  standardizedTerm: key,
  normalizedStandardizedTerm: key.toLowerCase(),
  synonymTerms: synonyms,
  normalizedSynonymTerms: synonyms.map((term) => term.toLowerCase()),
  allTerms: [key, ...synonyms].join(' '),
  fingerprint,
  jobId: `${baseId}5`,
  source: DatasetSynonymMappingSourceEnum.job,
  createTime: new Date('2026-01-01'),
  updateTime: new Date('2026-01-01')
});

const createNewMapping = ({
  key,
  fingerprint,
  synonyms
}: {
  key: string;
  fingerprint: string;
  synonyms: string[];
}): NormalizedSynonymMappingType => ({
  standardizedTerm: key,
  normalizedStandardizedTerm: key.toLowerCase(),
  synonymTerms: synonyms,
  normalizedSynonymTerms: synonyms.map((term) => term.toLowerCase()),
  allTerms: [key, ...synonyms].join(' '),
  fingerprint,
  sourceRows: [2]
});

describe('calculateSynonymMappingDiff', () => {
  it('classifies snapshots and preserves stable logical mapping ids', () => {
    const unchangedId = `${baseId}6`;
    const changedId = `${baseId}7`;
    const removedId = `${baseId}8`;
    const addedId = `${baseId}9`;
    const diff = calculateSynonymMappingDiff({
      activeMappings: [
        createActiveMapping({
          key: 'Phone',
          fingerprint: 'same',
          logicalMappingId: unchangedId,
          synonyms: ['Mobile']
        }),
        createActiveMapping({
          key: 'Refund',
          fingerprint: 'old',
          logicalMappingId: changedId,
          synonyms: ['Return']
        }),
        createActiveMapping({
          key: 'Order',
          fingerprint: 'removed',
          logicalMappingId: removedId,
          synonyms: ['Purchase']
        })
      ],
      newMappings: [
        createNewMapping({ key: 'Phone', fingerprint: 'same', synonyms: ['Mobile'] }),
        createNewMapping({ key: 'Refund', fingerprint: 'new', synonyms: ['Money back'] }),
        createNewMapping({ key: 'Invoice', fingerprint: 'added', synonyms: ['Bill'] })
      ],
      createLogicalMappingId: () => addedId
    });

    expect(diff.added[0]?.logicalMappingId).toBe(addedId);
    expect(diff.changed[0]?.newMapping.logicalMappingId).toBe(changedId);
    expect(diff.unchanged[0]?.newMapping.logicalMappingId).toBe(unchangedId);
    expect(diff.removed[0]?.logicalMappingId).toBe(removedId);
    expect(diff.affectedLogicalMappingIds).toEqual([addedId, changedId, removedId]);
    expect(diff.affectedTerms).toEqual(
      ['Invoice', 'Bill', 'Refund', 'Return', 'Refund', 'Money back', 'Order', 'Purchase'].filter(
        (term, index, terms) => terms.indexOf(term) === index
      )
    );
  });

  it('builds a complete pending snapshot without removed mappings', () => {
    const diff = calculateSynonymMappingDiff({
      activeMappings: [
        createActiveMapping({
          key: 'Removed',
          fingerprint: 'old',
          logicalMappingId: `${baseId}6`,
          synonyms: ['Gone']
        })
      ],
      newMappings: [createNewMapping({ key: 'Added', fingerprint: 'new', synonyms: ['New'] })],
      createLogicalMappingId: () => `${baseId}7`
    });

    expect(getPendingSynonymMappings(diff).map((mapping) => mapping.standardizedTerm)).toEqual([
      'Added'
    ]);
  });
});
