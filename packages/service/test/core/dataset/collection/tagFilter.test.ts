import { describe, expect, it } from 'vitest';
import { buildCollectionListTagMatch } from '@fastgpt/service/core/dataset/collection/tagFilter';

describe('buildCollectionListTagMatch', () => {
  it('returns empty object when no filters are selected', () => {
    expect(buildCollectionListTagMatch()).toEqual({});
    expect(buildCollectionListTagMatch([])).toEqual({});
  });

  it('uses $elemMatch for one tag and $and across tags', () => {
    expect(buildCollectionListTagMatch([{ tagId: 'type', values: ['PRD'] }])).toEqual({
      tags: {
        $elemMatch: {
          tagId: 'type',
          value: { $in: ['PRD'] }
        }
      }
    });

    expect(
      buildCollectionListTagMatch([
        { tagId: 'type', values: ['PRD'] },
        { tagId: 'version', values: [2] }
      ])
    ).toEqual({
      $and: [
        {
          tags: {
            $elemMatch: {
              tagId: 'type',
              value: { $in: ['PRD'] }
            }
          }
        },
        {
          tags: {
            $elemMatch: {
              tagId: 'version',
              value: { $in: [2] }
            }
          }
        }
      ]
    });
  });
});
