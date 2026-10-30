import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  effects: [] as (() => void)[],
  userInfo: null as { _id: string; team: { teamId: string } } | null
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => mocks.effects.push(effect)
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: mocks.userInfo })
}));

import {
  saveInvitationResultToast,
  useInvitationResultToast
} from '@/web/support/user/team/useInvitationResultToast';

const KEY = 'fastgpt:invitation-result-toast';
const result = { userId: 'user-1', teamId: 'team-2', status: 'info' as const };

const Consumer = () => {
  useInvitationResultToast();
  return null;
};

const render = () => {
  mocks.effects = [];
  renderToStaticMarkup(React.createElement(Consumer));
  mocks.effects.forEach((effect) => effect());
};

let storage: Map<string, string>;
let sessionStorage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userInfo = { _id: 'user-1', team: { teamId: 'team-2' } };
  storage = new Map();
  sessionStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key))
  };
  vi.stubGlobal('window', { sessionStorage });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('saveInvitationResultToast', () => {
  it('keeps the result in this tab for the next page load', () => {
    saveInvitationResultToast(result);
    expect(JSON.parse(storage.get(KEY)!)).toEqual(result);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('does not block navigation when session storage is unavailable', () => {
    sessionStorage.setItem.mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(() => saveInvitationResultToast(result)).not.toThrow();
  });
});

describe('useInvitationResultToast', () => {
  it.each(['info', 'success'] as const)(
    'shows %s for 3 seconds only once after the target user is loaded',
    (status) => {
      saveInvitationResultToast({ ...result, status });
      mocks.userInfo = null;
      render();
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(storage.has(KEY)).toBe(true);

      mocks.userInfo = { _id: 'user-1', team: { teamId: 'team-2' } };
      render();
      render();

      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        status,
        title: status === 'info' ? 'account_team:already_joined' : 'account_team:join_team_success',
        duration: 3000
      });
      expect(storage.has(KEY)).toBe(false);
      expect(sessionStorage.removeItem.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.toast.mock.invocationCallOrder[0]
      );
    }
  );

  it.each([
    { _id: 'other-user', team: { teamId: 'team-2' } },
    { _id: 'user-1', team: { teamId: 'other-team' } }
  ])('discards results for a different identity: %j', (userInfo) => {
    saveInvitationResultToast(result);
    mocks.userInfo = userInfo;
    render();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(storage.has(KEY)).toBe(false);
  });

  it.each(['not-json', '{}', JSON.stringify({ ...result, status: 'error' })])(
    'discards malformed results: %s',
    (raw) => {
      storage.set(KEY, raw);
      expect(render).not.toThrow();
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(storage.has(KEY)).toBe(false);
    }
  );

  it('does nothing without a pending invitation result', () => {
    render();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it('does not interrupt the page when session storage cannot be read', () => {
    sessionStorage.getItem.mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(render).not.toThrow();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
