import { describe, expect, it, vi } from 'vitest';
import { EventStreamContentType, fetchEventSource } from '@fortaine/fetch-event-source';
import { streamInitSkillRuntime, streamSkillDebugChat } from '@/web/core/skill/api';

const mocks = vi.hoisted(() => ({
  isPlus: false,
  hasMax: false,
  streamFetch: vi.fn()
}));

vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: vi.fn((url: string) => `http://test.local${url}`)
}));

vi.mock('@fortaine/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn()
}));

vi.mock('@/web/common/api/fetch', () => ({
  streamFetch: mocks.streamFetch
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: {
    getState: () => ({ feConfigs: { isPlus: mocks.isPlus, hasMax: mocks.hasMax } })
  }
}));

describe('streamInitSkillRuntime', () => {
  it('does not add the Web header to the POST runtime request', async () => {
    vi.mocked(fetchEventSource).mockImplementationOnce(async (_url, options) => {
      await options.onopen?.(
        new Response(null, {
          status: 200,
          headers: { 'content-type': EventStreamContentType }
        })
      );
      options.onclose?.();
    });

    const abortCtrl = new AbortController();
    await streamInitSkillRuntime({
      data: { skillId: 'skill-1' },
      onStatus: vi.fn(),
      onError: vi.fn(),
      abortCtrl
    });

    expect(fetchEventSource).toHaveBeenCalledWith(
      'http://test.local/api/core/ai/skill/runtime/init',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ skillId: 'skill-1' })
      })
    );
  });
});

describe('streamSkillDebugChat', () => {
  it.each([
    [false, false, '/api/core/ai/skill/debugChat'],
    [false, true, '/api/core/ai/skill/debugChat'],
    [true, false, '/api/core/ai/skill/debugChat'],
    [true, true, '/api/maxApi/core/ai/skill/debugChat']
  ])(
    'selects the expected endpoint when isPlus=%s, hasMax=%s',
    async (isPlus, hasMax, expectedUrl) => {
      mocks.isPlus = isPlus;
      mocks.hasMax = hasMax;
      mocks.streamFetch.mockResolvedValueOnce({ responseText: '' });
      const abortCtrl = new AbortController();
      const data = {
        skillId: 'skill-1',
        chatId: 'chat-1',
        modelId: 'model-1',
        messages: [{ role: 'user' as const, content: 'Create a skill' }]
      };
      const onMessage = vi.fn();

      await streamSkillDebugChat({ data, onMessage, abortCtrl });

      expect(mocks.streamFetch).toHaveBeenCalledWith({
        url: expectedUrl,
        data,
        onMessage,
        abortCtrl
      });
    }
  );
});
