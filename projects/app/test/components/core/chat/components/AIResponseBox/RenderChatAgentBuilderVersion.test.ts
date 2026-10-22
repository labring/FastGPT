import { JSDOM } from 'jsdom';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RenderChatAgentBuilderVersion from '@/components/core/chat/components/AIResponseBox/RenderChatAgentBuilderVersion';

const actions = vi.hoisted(() => ({ isApplying: false, applyConfig: vi.fn() }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({ ChatItemContext: {} }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (value: unknown) => unknown) =>
    select({ chatAgentBuilderVersionActions: actions })
}));
vi.mock('@chakra-ui/react', () => ({
  Flex: ({ children }: { children: ReactNode }) => React.createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => React.createElement('span', null, children),
  Button: ({
    children,
    onClick,
    isDisabled,
    isLoading
  }: {
    children: ReactNode;
    onClick: () => void;
    isDisabled: boolean;
    isLoading: boolean;
  }) => React.createElement('button', { onClick, disabled: isDisabled || isLoading }, children)
}));

describe('historical generated configuration card', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    actions.isApplying = false;
    actions.applyConfig.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const render = async ({ expired = false, isChatting = false } = {}) => {
    await act(async () =>
      root.render(
        React.createElement(RenderChatAgentBuilderVersion, {
          version: {
            s3Key: 'chat/helper/config.json',
            expiresAt: expired ? '2000-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z'
          },
          responseChatItemId: 'historical-ai',
          isChatting
        })
      )
    );
    return container.querySelector('button')!;
  };

  it('applies only after an explicit click on the stored message', async () => {
    const button = await render();
    expect(actions.applyConfig).not.toHaveBeenCalled();
    await act(async () => button.click());
    expect(actions.applyConfig).toHaveBeenCalledExactlyOnceWith('historical-ai');
  });

  it('checks expiration again when a page has remained open past the archive lifetime', async () => {
    const button = await render();
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2100-01-01T00:00:00.000Z').getTime());
    await act(async () => button.click());
    expect(actions.applyConfig).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('chat_agent_config_expired');
  });

  it.each(['expired', 'isChatting', 'isApplying'] as const)(
    'disables application while %s',
    async (state) => {
      actions.isApplying = state === 'isApplying';
      const button = await render({
        expired: state === 'expired',
        isChatting: state === 'isChatting'
      });
      expect(button.disabled).toBe(true);
      await act(async () => button.click());
      expect(actions.applyConfig).not.toHaveBeenCalled();
      if (state === 'expired') expect(button.textContent).toBe('chat_agent_config_expired');
    }
  );
});
