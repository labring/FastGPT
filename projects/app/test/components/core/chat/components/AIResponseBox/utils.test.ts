import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { onSendPrompt } from '@/components/core/chat/components/AIResponseBox/utils';

describe('AIResponseBox utils', () => {
  beforeEach(() => {
    eventBus.off(EventNameEnum.sendQuestion);
  });

  it('does not request clearing chat input for interactive send event', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.sendQuestion, handler);

    onSendPrompt('A');

    expect(handler).toHaveBeenCalledWith({
      text: 'A',
      focus: true
    });
  });
});
