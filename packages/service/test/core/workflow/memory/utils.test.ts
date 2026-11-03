import { describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { mergeWorkflowMemories } from '@fastgpt/service/core/workflow/memory/utils';

const rootSource = { sourceType: ChatSourceTypeEnum.app, sourceId: 'root_app' };

describe('mergeWorkflowMemories', () => {
  it('merges incoming delta and cleans up superseded legacy keys', () => {
    const merged = mergeWorkflowMemories({
      rootSource,
      baseline: {
        'agentLoopMemory-node_1': { providerState: { step: 1 } },
        'app:shared_child_app:extract_1': { oldUnscoped: true },
        'app:root_app:keep_me': { keep: 1 }
      },
      entries: {
        'app:root_app:node_1': undefined,
        'node:runApp_1/app:shared_child_app:extract_1': { scoped: true }
      }
    });

    expect(merged).toEqual({
      'app:root_app:keep_me': { keep: 1 },
      'app:root_app:node_1': undefined,
      'node:runApp_1/app:shared_child_app:extract_1': { scoped: true }
    });
    expect(Object.hasOwn(merged, 'agentLoopMemory-node_1')).toBe(false);
    expect(Object.hasOwn(merged, 'app:shared_child_app:extract_1')).toBe(false);
  });
});
