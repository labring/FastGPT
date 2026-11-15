import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { selectChatHistories } from '@fastgpt/service/core/workflow/dispatch/ai/chat/historyWindow';
import { getHistories } from '@fastgpt/service/core/workflow/dispatch/utils';

const memoryKey = 'app:source:chat:historyWindow';
const rounds = (count: number): ChatItemMiniType[] =>
  Array.from({ length: count }, (_, index) => [
    { dataId: `r${index}`, obj: ChatRoleEnum.Human, value: [{ text: { content: `q${index}` } }] },
    { dataId: `r${index}`, obj: ChatRoleEnum.AI, value: [{ text: { content: `a${index}` } }] }
  ]).flat();
const select = ({
  histories,
  window = { min: 2, max: 4 },
  history = 2
}: {
  histories: ChatItemMiniType[];
  window?: unknown;
  history?: number | ChatItemMiniType[];
}) =>
  selectChatHistories({
    histories,
    window,
    history,
    memoryKey,
    responseChatItemId: 'current'
  });
const withMemory = (histories: ChatItemMiniType[], overrides: Record<string, unknown> = {}) => {
  histories.findLast((item) => item.obj === ChatRoleEnum.AI)!.memories = {
    [memoryKey]: { min: 2, max: 4, startDataId: 'r0', ...overrides }
  };
  return histories;
};
const userIds = (histories: ChatItemMiniType[]) =>
  histories.filter((item) => item.obj === ChatRoleEnum.Human).map((item) => item.dataId);

describe('periodic history recovery boundaries', () => {
  it('starts with min when enabled in an existing long conversation', () => {
    expect(userIds(select({ histories: rounds(10) }).histories)).toEqual(['r8', 'r9']);
  });
  it('restores the anchor instead of counting a bounded history slice', () => {
    expect(userIds(select({ histories: withMemory(rounds(4)) }).histories)).toEqual([
      'r0',
      'r1',
      'r2',
      'r3'
    ]);
    expect(userIds(select({ histories: withMemory(rounds(5)) }).histories)).toEqual(['r3', 'r4']);
  });
  it.each(['deleted', 'r0'])(
    'resets after deletion of the anchor or a config change (%s)',
    (startDataId) => {
      const history = withMemory(rounds(4), {
        startDataId,
        ...(startDataId === 'r0' ? { max: 5 } : {})
      });
      expect(userIds(select({ histories: history }).histories)).toEqual(['r2', 'r3']);
    }
  );
  it('recovers the last successful state after a failed round and respects an explicit disable marker', () => {
    const history = withMemory(rounds(3));
    history.push(...rounds(1).map((item) => ({ ...item, dataId: 'new-round' })));
    expect(userIds(select({ histories: history }).histories)).toEqual([
      'r0',
      'r1',
      'r2',
      'new-round'
    ]);
    history.findLast((item) => item.obj === ChatRoleEnum.AI)!.memories = { [memoryKey]: null };
    expect(userIds(select({ histories: history }).histories)).toEqual(['r2', 'new-round']);
  });
  it.each([undefined, null, { min: 2, max: 4, startDataId: 'r1' }])(
    'prefers the current runtime snapshot over older history memory (%j)',
    (value) => {
      const histories = withMemory(rounds(4));
      const before = structuredClone(histories);
      const result = selectChatHistories({
        histories,
        history: 2,
        window: { min: 2, max: 4 },
        memoryKey,
        memories: value === undefined ? {} : { [memoryKey]: value },
        responseChatItemId: 'current'
      });
      expect(userIds(result.histories)).toEqual(value ? ['r1', 'r2', 'r3'] : ['r2', 'r3']);
      expect(histories).toEqual(before);
    }
  );

  it('does not reuse another node or source memory', () => {
    expect(
      userIds(
        selectChatHistories({
          histories: withMemory(rounds(4)),
          history: 2,
          window: { min: 2, max: 4 },
          memoryKey: 'another-node',
          responseChatItemId: 'current'
        }).histories
      )
    ).toEqual(['r2', 'r3']);
  });
  it('retrying the same history produces the same window without mutating stored memory', () => {
    const history = withMemory(rounds(5));
    const before = structuredClone(history);
    expect(select({ histories: history })).toEqual(select({ histories: history }));
    expect(history).toEqual(before);
  });
  it('counts Human boundaries and retains complete rounds and leading system messages', () => {
    const history = withMemory(rounds(3));
    history.splice(2, 0, {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'extra assistant' } }]
    });
    history.unshift({ obj: ChatRoleEnum.System, value: [{ text: { content: 'system' } }] });
    const selected = select({ histories: history }).histories;
    expect(selected).toEqual(history);
    expect(userIds(selected)).toHaveLength(3);
  });
  it.each([0, 2])('min=max behaves as a fixed window, including zero (%s)', (count) => {
    expect(
      userIds(
        select({ histories: withMemory(rounds(5)), window: { min: count, max: count } }).histories
      )
    ).toEqual(count ? ['r3', 'r4'] : []);
  });
  it('anchors a zero-history reset at the current round for the next request', () => {
    const result = select({ histories: rounds(5), window: { min: 0, max: 4 } });
    expect(result.histories).toEqual([]);
    expect(result.memories?.[memoryKey]?.startDataId).toBe('current');
    const system = { obj: ChatRoleEnum.System, value: [{ text: { content: 'history system' } }] };
    expect(
      select({ histories: [system, ...rounds(2)], window: { min: 0, max: 0 } }).histories
    ).toEqual([]);
  });
  it('leaves explicit and fixed history behavior unchanged', () => {
    const custom = rounds(1);
    expect(select({ histories: rounds(4), window: { invalid: true }, history: custom })).toEqual({
      histories: custom
    });
    expect(select({ histories: rounds(4), window: null, history: 2 }).histories).toEqual(
      getHistories(2, rounds(4))
    );
    expect(select({ histories: withMemory(rounds(4)), window: null }).memories).toEqual({
      [memoryKey]: null
    });
  });
  it('leaves compression checkpoints under the original history rules', () => {
    const history = withMemory(rounds(5));
    history[3].value = [{ contextCheckpoint: 'Earlier conversation summary' }];
    expect(select({ histories: history }).histories).toEqual(getHistories(2, history));
  });
  it('leaves unfinished interactions under the original history rules', () => {
    const history = withMemory(rounds(5));
    history.at(-1)!.value = [
      {
        interactive: {
          entryNodeIds: [],
          memoryEdges: [],
          nodeOutputs: [],
          type: 'userSelect',
          params: {
            description: 'Choose',
            userSelectOptions: [{ value: 'a', key: 'a' }]
          }
        }
      }
    ];
    expect(select({ histories: history }).histories).toEqual(getHistories(2, history));
  });
  it.each([{ min: 5, max: 2 }, { min: -1, max: 4 }, { min: 1, max: 51 }, { min: 1.5, max: 4 }, {}])(
    'rejects invalid bounds (%j)',
    (window) => {
      expect(() => select({ histories: rounds(2), window: window })).toThrow(
        'Invalid periodic history window'
      );
    }
  );
});
