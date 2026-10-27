import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowNodeMemoryKey,
  mergePersistedWorkflowMemories,
  readWorkflowNodeMemory,
  WorkflowMemoryState
} from '@fastgpt/service/core/workflow/dispatch/utils/memories';

const rootAppInfo = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'root_app',
  teamId: 'team_1',
  tmbId: 'tmb_1',
  name: 'Root App'
};

const sharedChildAppInfo = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'shared_child_app',
  teamId: 'team_1',
  tmbId: 'tmb_1',
  name: 'Shared Child App',
  isChildApp: true
};

const createAiHistory = (memories: Record<string, any>): ChatItemMiniType[] => [
  {
    obj: ChatRoleEnum.Human,
    value: [{ text: { content: 'user input' } }]
  },
  {
    obj: ChatRoleEnum.AI,
    value: [{ text: { content: 'ai output' } }],
    memories
  }
];

describe('WorkflowMemoryState & unified node memory helpers', () => {
  describe('baseline / delta separation & unified key scoping', () => {
    it('separates baseline and delta so forked child workflows only report their own writes', () => {
      const rootState = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'app:root_app:extract_root': { city: 'Hangzhou' },
          'app:root_app:untouched': { keep: true }
        })
      );

      expect(rootState.isForked).toBe(false);
      expect(rootState.getDelta()).toEqual({});
      expect(
        rootState.readNodeMemory({
          runningAppInfo: rootAppInfo,
          nodeId: 'extract_root'
        })
      ).toEqual({ city: 'Hangzhou' });

      // Fork a child workflow scope
      const childState = rootState.fork('node:runApp_1');
      expect(childState.isForked).toBe(true);
      expect(childState.getDelta()).toEqual({});

      const childKey = childState.getNodeMemoryKey({
        runningAppInfo: sharedChildAppInfo,
        nodeId: 'extract_inner'
      });
      expect(childKey).toBe('node:runApp_1/app:shared_child_app:extract_inner');

      childState.merge({
        [childKey]: { slot: 'booked' }
      });

      // Child delta ONLY contains keys written inside the child scope, never the inherited baseline
      expect(childState.getDelta()).toEqual({
        'node:runApp_1/app:shared_child_app:extract_inner': { slot: 'booked' }
      });

      rootState.merge(childState.getDelta());
      expect(rootState.toRecord()).toEqual({
        'app:root_app:extract_root': { city: 'Hangzhou' },
        'app:root_app:untouched': { keep: true },
        'node:runApp_1/app:shared_child_app:extract_inner': { slot: 'booked' }
      });
    });

    it('supports multi-level nested scopes (Root -> Agent -> SubApp -> Plugin)', () => {
      const rootState = WorkflowMemoryState.fromHistories();
      const agentScope = rootState.fork('node:agent_1');
      const pluginScope = agentScope.fork('node:plugin_2');

      const nestedKey = getWorkflowNodeMemoryKey({
        memoryState: pluginScope,
        runningAppInfo: {
          ...sharedChildAppInfo,
          sourceId: 'plugin_workflow_id'
        },
        nodeId: 'classify_1'
      });

      expect(nestedKey).toBe('node:agent_1/node:plugin_2/app:plugin_workflow_id:classify_1');
    });

    it('deep-clones values on read and write to prevent reference mutation leaks', () => {
      const initialObj = { nested: { count: 1 } };
      const state = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'app:root_app:node_1': initialObj
        })
      );

      initialObj.nested.count = 999;
      const readVal = state.readNodeMemory({
        runningAppInfo: rootAppInfo,
        nodeId: 'node_1'
      });
      expect(readVal).toEqual({ nested: { count: 1 } });

      readVal.nested.count = 888;
      expect(
        state.readNodeMemory({
          runningAppInfo: rootAppInfo,
          nodeId: 'node_1'
        })
      ).toEqual({ nested: { count: 1 } });
    });
  });

  describe('legacy key compatibility & migration', () => {
    it('reads legacy unscoped child key and legacy agentLoopMemory key, and cleans them up once superseded', () => {
      const rootState = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'app:shared_child_app:extract_1': { legacyChild: true },
          'agentLoopMemory-agent_1': { providerState: { step: 2 } }
        })
      );

      // 1. Legacy piAgent key is readable via unified readNodeMemory
      expect(
        rootState.readNodeMemory({
          runningAppInfo: rootAppInfo,
          nodeId: 'agent_1'
        })
      ).toEqual({ providerState: { step: 2 } });

      // 2. Legacy unscoped child key is readable when no scoped key exists yet
      const childState = rootState.fork('node:runApp_1');
      expect(
        childState.readNodeMemory({
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1'
        })
      ).toEqual({ legacyChild: true });

      // 3. Once new canonical keys are written, toRecord() cleans up the superseded legacy keys
      const childCanonicalKey = childState.getNodeMemoryKey({
        runningAppInfo: sharedChildAppInfo,
        nodeId: 'extract_1'
      });
      childState.merge({
        [childCanonicalKey]: { legacyChild: false, migrated: true }
      });
      rootState.merge(childState.getDelta());

      const agentCanonicalKey = rootState.getNodeMemoryKey({
        runningAppInfo: rootAppInfo,
        nodeId: 'agent_1'
      });
      rootState.merge({
        [agentCanonicalKey]: undefined
      });

      const finalRecord = rootState.toRecord();
      expect(finalRecord).toEqual({
        'node:runApp_1/app:shared_child_app:extract_1': { legacyChild: false, migrated: true },
        'app:root_app:agent_1': undefined
      });
      expect(Object.hasOwn(finalRecord, 'app:shared_child_app:extract_1')).toBe(false);
      expect(Object.hasOwn(finalRecord, 'agentLoopMemory-agent_1')).toBe(false);
    });

    it('does not fall back to legacy unscoped child key if another scoped instance already exists in baseline', () => {
      const rootState = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'app:shared_child_app:extract_1': { staleUnscoped: true },
          'node:runApp_A/app:shared_child_app:extract_1': { fromA: true }
        })
      );

      const childStateB = rootState.fork('node:runApp_B');
      expect(
        childStateB.readNodeMemory({
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1'
        })
      ).toBeUndefined();
    });
  });

  describe('history parameter 3-state contract', () => {
    it('respects history === 0, custom ChatItemMiniType[], and numeric window with empty histories', () => {
      const parentState = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'node:agent_1/app:shared_child_app:extract_1': { fromSessionMemory: 'yes' }
        })
      ).fork('node:agent_1');

      // 1. history === 0 disables memory read
      expect(
        readWorkflowNodeMemory({
          memoryState: parentState,
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1',
          history: 0,
          histories: []
        })
      ).toBeUndefined();

      // 2. Numeric history > 0 reads from memoryState even when histories is [] (Agent sub-app scenario)
      expect(
        readWorkflowNodeMemory({
          memoryState: parentState,
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1',
          history: 6,
          histories: []
        })
      ).toEqual({ fromSessionMemory: 'yes' });

      // 3. Explicit custom ChatItemMiniType[] array reads only from that custom array
      expect(
        readWorkflowNodeMemory({
          memoryState: parentState,
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1',
          history: [],
          histories: []
        })
      ).toBeUndefined();

      const customHistories = createAiHistory({
        'app:shared_child_app:extract_1': { fromCustomArray: 'custom' }
      });
      expect(
        readWorkflowNodeMemory({
          memoryState: parentState,
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1',
          history: customHistories,
          histories: []
        })
      ).toEqual({ fromCustomArray: 'custom' });
    });

    it('isolates fork() baseline when history === 0 or custom history array is passed, unless interactive resume is active', () => {
      const rootState = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'node:runApp_1/app:shared_child_app:extract_1': { fromParentSession: 'leaked' }
        })
      );

      // 1. history === 0 clears baseline on fork
      const disabledHistoryChild = rootState.fork('node:runApp_1', {
        history: 0,
        hasInteractiveResume: false
      });
      expect(
        disabledHistoryChild.readNodeMemory({
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1'
        })
      ).toBeUndefined();

      // 2. Interactive resume preserves baseline even when history === 0
      const interactiveResumeChild = rootState.fork('node:runApp_1', {
        history: 0,
        hasInteractiveResume: true
      });
      expect(
        interactiveResumeChild.readNodeMemory({
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1'
        })
      ).toEqual({ fromParentSession: 'leaked' });

      // 3. Custom history array initializes baseline from that custom array
      const customHistories = createAiHistory({
        'node:runApp_1/app:shared_child_app:extract_1': { fromCustomArray: 'custom' }
      });
      const customHistoryChild = rootState.fork('node:runApp_1', {
        history: customHistories,
        histories: customHistories
      });
      expect(
        customHistoryChild.readNodeMemory({
          runningAppInfo: sharedChildAppInfo,
          nodeId: 'extract_1'
        })
      ).toEqual({ fromCustomArray: 'custom' });
    });

    it('mergePersistedWorkflowMemories merges incoming delta and cleans up superseded legacy keys', () => {
      const merged = mergePersistedWorkflowMemories(
        {
          'agentLoopMemory-node_1': { providerState: { step: 1 } },
          'app:shared_child_app:extract_1': { oldUnscoped: true },
          'app:root_app:keep_me': { keep: 1 }
        },
        {
          'app:root_app:node_1': undefined,
          'node:runApp_1/app:shared_child_app:extract_1': { scoped: true }
        }
      );

      expect(merged).toEqual({
        'app:root_app:keep_me': { keep: 1 },
        'app:root_app:node_1': undefined,
        'node:runApp_1/app:shared_child_app:extract_1': { scoped: true }
      });
      expect(Object.hasOwn(merged, 'agentLoopMemory-node_1')).toBe(false);
      expect(Object.hasOwn(merged, 'app:shared_child_app:extract_1')).toBe(false);
    });
  });

  describe('parallel multiple child nodes (并行多子节点) concurrency guarantees', () => {
    it('prevents a slower parallel child workflow from overwriting a faster sibling leaf node update with stale baseline', async () => {
      const rootState = WorkflowMemoryState.fromHistories(
        createAiHistory({
          'app:root_app:extract_fast': { step: 'turn_1_old' }
        })
      );

      // Both branches start concurrently at t = 0
      const slowChildState = rootState.fork('node:runApp_slow');

      // Fast root leaf node finishes first and updates 'app:root_app:extract_fast'
      rootState.merge({
        'app:root_app:extract_fast': { step: 'turn_2_new' }
      });

      // Slow child workflow finishes later; its baseline still has 'turn_1_old',
      // but it only merges its own delta back to rootState
      const slowChildKey = slowChildState.getNodeMemoryKey({
        runningAppInfo: sharedChildAppInfo,
        nodeId: 'inner_node'
      });
      slowChildState.merge({
        [slowChildKey]: { childDone: true }
      });
      rootState.merge(slowChildState.getDelta());

      expect(rootState.toRecord()).toEqual({
        'app:root_app:extract_fast': { step: 'turn_2_new' },
        'node:runApp_slow/app:shared_child_app:inner_node': { childDone: true }
      });
    });

    it('isolates parallel canvas mounts of the exact same child app template', () => {
      const rootState = WorkflowMemoryState.fromHistories();

      // Parallel runApp_A and runApp_B mounting the same sharedChildAppInfo
      const branchA = rootState.fork('node:runApp_A');
      const branchB = rootState.fork('node:runApp_B');

      const keyA = branchA.getNodeMemoryKey({
        runningAppInfo: sharedChildAppInfo,
        nodeId: 'extract_1'
      });
      const keyB = branchB.getNodeMemoryKey({
        runningAppInfo: sharedChildAppInfo,
        nodeId: 'extract_1'
      });

      expect(keyA).toBe('node:runApp_A/app:shared_child_app:extract_1');
      expect(keyB).toBe('node:runApp_B/app:shared_child_app:extract_1');

      branchA.merge({ [keyA]: { branch: 'A' } });
      branchB.merge({ [keyB]: { branch: 'B' } });

      rootState.merge(branchA.getDelta());
      rootState.merge(branchB.getDelta());

      expect(rootState.toRecord()).toEqual({
        'node:runApp_A/app:shared_child_app:extract_1': { branch: 'A' },
        'node:runApp_B/app:shared_child_app:extract_1': { branch: 'B' }
      });
    });

    it('isolates Agent parallel batch tool calls (including two cloned sub-apps with identical internal piAgent nodeId)', () => {
      const rootState = WorkflowMemoryState.fromHistories();
      const agentState = rootState.fork('node:agent_main');

      // Agent calls SubApp_1 and SubApp_2 in parallel in a single batch (batchToolSize: 5)
      const toolCall1State = agentState.fork();
      const toolCall2State = agentState.fork();

      const subApp1Info = { ...sharedChildAppInfo, sourceId: 'sub_app_1' };
      const subApp2Info = { ...sharedChildAppInfo, sourceId: 'sub_app_2' };

      // Both SubApp_1 and SubApp_2 have an internal piAgent node with the exact same nodeId 'inner_pi_agent'
      const piKey1 = toolCall1State.getNodeMemoryKey({
        runningAppInfo: subApp1Info,
        nodeId: 'inner_pi_agent'
      });
      const piKey2 = toolCall2State.getNodeMemoryKey({
        runningAppInfo: subApp2Info,
        nodeId: 'inner_pi_agent'
      });

      expect(piKey1).toBe('node:agent_main/app:sub_app_1:inner_pi_agent');
      expect(piKey2).toBe('node:agent_main/app:sub_app_2:inner_pi_agent');

      toolCall1State.merge({ [piKey1]: { providerState: { tool: 1 } } });
      toolCall2State.merge({ [piKey2]: { providerState: { tool: 2 } } });

      agentState.merge(toolCall1State.getDelta());
      agentState.merge(toolCall2State.getDelta());

      // Next sequential step in the same Agent turn immediately sees both tool calls' memories
      const step2ToolCallState = agentState.fork();
      expect(
        step2ToolCallState.readNodeMemory({
          runningAppInfo: subApp1Info,
          nodeId: 'inner_pi_agent'
        })
      ).toEqual({ providerState: { tool: 1 } });
      expect(
        step2ToolCallState.readNodeMemory({
          runningAppInfo: subApp2Info,
          nodeId: 'inner_pi_agent'
        })
      ).toEqual({ providerState: { tool: 2 } });
    });
  });
});
