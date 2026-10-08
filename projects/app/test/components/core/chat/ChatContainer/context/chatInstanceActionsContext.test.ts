import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ChatInstanceActionsContext,
  useChatInstanceActions
} from '@/components/core/chat/ChatContainer/context/chatInstanceActionsContext';
import type { ChatInstanceActions } from '@/components/core/chat/ChatContainer/context/chatInstanceRegistry';
import { registerChatInstanceActions } from '@/components/core/chat/ChatContainer/context/chatInstanceRegistry';

const ActionConsumer = ({ onRead }: { onRead: (actions: ChatInstanceActions) => void }) => {
  onRead(useChatInstanceActions());
  return null;
};

describe('chatInstanceActionsContext', () => {
  it('returns the actions from the nearest ChatBox provider', () => {
    const actions: ChatInstanceActions = {
      sendMessage: vi.fn(),
      continueInteractive: vi.fn(),
      fillInput: vi.fn()
    };
    let receivedActions: ChatInstanceActions | undefined;

    renderToStaticMarkup(
      React.createElement(
        ChatInstanceActionsContext.Provider,
        { value: actions },
        React.createElement(ActionConsumer, {
          onRead: (value) => {
            receivedActions = value;
          }
        })
      )
    );

    expect(receivedActions).toBe(actions);
  });

  it('keeps legacy callers working when the page has only one ChatBox', () => {
    const registeredActions: ChatInstanceActions = {
      sendMessage: vi.fn(),
      continueInteractive: vi.fn(),
      fillInput: vi.fn()
    };
    const unregister = registerChatInstanceActions({
      identity: { sourceKey: 'app:app-1', chatId: 'chat-1' },
      actions: registeredActions
    });
    let fallbackActions: ChatInstanceActions | undefined;

    renderToStaticMarkup(
      React.createElement(ActionConsumer, {
        onRead: (value) => {
          fallbackActions = value;
        }
      })
    );

    fallbackActions?.sendMessage({ text: 'send' });
    fallbackActions?.continueInteractive({ text: 'continue' });
    fallbackActions?.fillInput({ text: 'fill' });

    expect(registeredActions.sendMessage).toHaveBeenCalledWith({ text: 'send' });
    expect(registeredActions.continueInteractive).toHaveBeenCalledWith({ text: 'continue' });
    expect(registeredActions.fillInput).toHaveBeenCalledWith({ text: 'fill' });

    unregister();
  });
});
