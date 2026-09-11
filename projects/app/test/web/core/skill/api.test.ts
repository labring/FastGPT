import { describe, expect, it, vi } from 'vitest';
import { EventStreamContentType, fetchEventSource } from '@fortaine/fetch-event-source';
import { streamInitSkillRuntime } from '@/web/core/skill/api';

vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: vi.fn((url: string) => `http://test.local${url}`)
}));

vi.mock('@fortaine/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn()
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
