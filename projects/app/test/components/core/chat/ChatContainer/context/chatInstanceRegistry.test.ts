import { describe, expect, it, vi } from 'vitest';
import {
  dispatchChatInstanceAction,
  getChatInstanceKey,
  registerChatInstanceActions,
  retainExternalChatPromptListener,
  type ChatInstanceActions
} from '@/components/core/chat/ChatContainer/context/chatInstanceRegistry';

const createActions = (): ChatInstanceActions => ({
  sendMessage: vi.fn(),
  continueInteractive: vi.fn(),
  fillInput: vi.fn()
});

describe('chatInstanceRegistry', () => {
  it('uses sourceKey and chatId together as the instance identity', () => {
    expect(getChatInstanceKey({ sourceKey: 'app:app-1', chatId: 'chat-1' })).not.toBe(
      getChatInstanceKey({ sourceKey: 'workflowBuilder:app-1', chatId: 'chat-1' })
    );
  });

  it('keeps a single ChatBox compatible with untargeted dispatch', () => {
    const actions = createActions();
    const unregister = registerChatInstanceActions({
      identity: { sourceKey: 'app:app-1', chatId: 'chat-1' },
      actions
    });

    expect(dispatchChatInstanceAction({ action: 'sendMessage', input: { text: 'hello' } })).toBe(
      'sent'
    );
    expect(actions.sendMessage).toHaveBeenCalledWith({ text: 'hello' });

    unregister();
  });

  it('routes a targeted action only to the matching ChatBox', () => {
    const leftActions = createActions();
    const rightActions = createActions();
    const unregisterLeft = registerChatInstanceActions({
      identity: { sourceKey: 'workflowBuilder:app-1', chatId: 'builder-chat' },
      actions: leftActions
    });
    const unregisterRight = registerChatInstanceActions({
      identity: { sourceKey: 'app:app-1', chatId: 'preview-chat' },
      actions: rightActions
    });

    expect(
      dispatchChatInstanceAction({
        action: 'continueInteractive',
        input: { text: '{"userAnswer":"不知道"}' },
        target: { sourceKey: 'app:app-1', chatId: 'preview-chat' }
      })
    ).toBe('sent');
    expect(rightActions.continueInteractive).toHaveBeenCalledOnce();
    expect(leftActions.continueInteractive).not.toHaveBeenCalled();

    unregisterLeft();
    unregisterRight();
  });

  it('rejects an untargeted action when multiple ChatBoxes are mounted', () => {
    const leftActions = createActions();
    const rightActions = createActions();
    const unregisterLeft = registerChatInstanceActions({
      identity: { sourceKey: 'workflowBuilder:app-1', chatId: 'builder-chat' },
      actions: leftActions
    });
    const unregisterRight = registerChatInstanceActions({
      identity: { sourceKey: 'app:app-1', chatId: 'preview-chat' },
      actions: rightActions
    });

    expect(
      dispatchChatInstanceAction({ action: 'sendMessage', input: { text: 'ambiguous' } })
    ).toBe('ambiguous');
    expect(leftActions.sendMessage).not.toHaveBeenCalled();
    expect(rightActions.sendMessage).not.toHaveBeenCalled();

    unregisterLeft();
    unregisterRight();
  });

  it('only removes the registration owned by its cleanup', () => {
    const leftActions = createActions();
    const rightActions = createActions();
    const unregisterLeft = registerChatInstanceActions({
      identity: { sourceKey: 'workflowBuilder:app-1', chatId: 'builder-chat' },
      actions: leftActions
    });
    const unregisterRight = registerChatInstanceActions({
      identity: { sourceKey: 'app:app-1', chatId: 'preview-chat' },
      actions: rightActions
    });

    unregisterRight();
    unregisterRight();

    expect(dispatchChatInstanceAction({ action: 'fillInput', input: { text: 'left draft' } })).toBe(
      'sent'
    );
    expect(leftActions.fillInput).toHaveBeenCalledWith({ text: 'left draft' });
    expect(rightActions.fillInput).not.toHaveBeenCalled();

    unregisterLeft();
    expect(
      dispatchChatInstanceAction({ action: 'sendMessage', input: { text: 'no instance' } })
    ).toBe('not-found');
  });

  it('treats duplicate registrations for the same identity as ambiguous', () => {
    const firstActions = createActions();
    const secondActions = createActions();
    const identity = { sourceKey: 'app:app-1', chatId: 'same-chat' };
    const unregisterFirst = registerChatInstanceActions({ identity, actions: firstActions });
    const unregisterSecond = registerChatInstanceActions({ identity, actions: secondActions });

    expect(
      dispatchChatInstanceAction({
        action: 'sendMessage',
        input: { text: 'duplicate' },
        target: identity
      })
    ).toBe('ambiguous');

    unregisterFirst();
    unregisterSecond();
  });

  it('shares one postMessage listener and routes a targeted legacy prompt', () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const addEventListener = vi.fn(
      (_type: string, listener: (event: MessageEvent<unknown>) => void) => {
        listeners.add(listener);
      }
    );
    const removeEventListener = vi.fn(
      (_type: string, listener: (event: MessageEvent<unknown>) => void) => {
        listeners.delete(listener);
      }
    );
    vi.stubGlobal('window', { addEventListener, removeEventListener });

    const actions = createActions();
    const identity = { sourceKey: 'app:app-1', chatId: 'preview-chat' };
    const unregister = registerChatInstanceActions({ identity, actions });
    const releaseFirst = retainExternalChatPromptListener();
    const releaseSecond = retainExternalChatPromptListener();

    expect(addEventListener).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(1);
    listeners.forEach((listener) =>
      listener({
        data: {
          type: 'sendPrompt',
          text: 'external answer',
          target: identity
        }
      } as MessageEvent<unknown>)
    );
    expect(actions.continueInteractive).toHaveBeenCalledWith({ text: 'external answer' });

    releaseFirst();
    expect(removeEventListener).not.toHaveBeenCalled();
    releaseSecond();
    expect(removeEventListener).toHaveBeenCalledOnce();

    unregister();
    vi.unstubAllGlobals();
  });
});
