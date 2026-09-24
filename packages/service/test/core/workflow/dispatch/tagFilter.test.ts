import { describe, expect, it } from 'vitest';
import { formatWorkflowCollectionFilterMatch } from '@fastgpt/service/core/workflow/dispatch/utils/tagFilter';
import {
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum
} from '@fastgpt/global/core/dataset/workflowTagFilter';

describe('formatWorkflowCollectionFilterMatch', () => {
  it('formats FastGPT structured AST form filter values', () => {
    const ast = {
      logic: DatasetTagFilterLogicEnum.AND,
      conditions: [
        {
          tag: 'department',
          tagType: 'string' as const,
          op: '$eq',
          valueMode: DatasetTagFilterValueModeEnum.reference,
          value: ['node_user', 'dept']
        }
      ]
    };

    const formatted = formatWorkflowCollectionFilterMatch({
      value: ast,
      resolveReference: (ref) => (ref[0] === 'node_user' ? 'Engineering' : undefined)
    });

    expect(formatted).toBe(
      JSON.stringify({
        tags: {
          $and: [{ department: { $eq: 'Engineering' } }]
        }
      })
    );
  });

  it('delegates to Sangfor adapter for Sangfor search payloads', () => {
    const payload = {
      tags: {
        $or: [{ role: { $eq: ['$ref', 'node_1', 'role_name'] } }]
      }
    };

    const formatted = formatWorkflowCollectionFilterMatch({
      value: payload,
      resolveReference: (ref) => (ref[0] === 'node_1' ? 'Admin' : undefined)
    });

    expect(formatted).toBe(
      JSON.stringify({
        tags: {
          $or: [{ role: { $eq: 'Admin' } }]
        }
      })
    );
  });

  it('passes through legacy strings and non-AST objects safely', () => {
    expect(formatWorkflowCollectionFilterMatch({ value: 'custom legacy tag' })).toBe(
      'custom legacy tag'
    );
    expect(formatWorkflowCollectionFilterMatch({ value: { custom: 'param' } })).toBe(
      JSON.stringify({ custom: 'param' })
    );
    expect(formatWorkflowCollectionFilterMatch({ value: undefined })).toBeUndefined();
    expect(formatWorkflowCollectionFilterMatch({ value: null })).toBeUndefined();
    expect(formatWorkflowCollectionFilterMatch({ value: '' })).toBeUndefined();
  });
});
