import { describe, expect, it } from 'vitest';
import { SessionCoordinator } from '@fastgpt/web/common/auth/sessionCoordinator';
import type { SessionLifecycle } from '@fastgpt/global/support/user/session/type';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';

describe('browser session pre-refresh coordination', () => {
  const lifecycle = (): SessionLifecycle => ({
    sessionId: 'user:device',
    serverTime: 1000,
    createdAt: 1000,
    accessExpiresAt: 901_000,
    refreshExpiresAt: 1_000_000,
    absoluteExpiresAt: 2_000_000,
    generation: 1,
    contextVersion: 1
  });
  it('coalesces concurrent pre-refresh and lets every original request continue with one successor', async () => {
    let now = 0;
    let calls = 0;
    let release!: (value: { session: SessionLifecycle }) => void;
    const pending = new Promise<{ session: SessionLifecycle }>((resolve) => {
      release = resolve;
    });
    const coordinator = new SessionCoordinator({
      now: () => now,
      request: async () => {
        calls++;
        return pending;
      }
    });
    const session = {
      sessionId: 'user:device',
      serverTime: 1000,
      createdAt: 1000,
      accessExpiresAt: 31_000,
      refreshExpiresAt: 1_000_000,
      absoluteExpiresAt: 2_000_000,
      generation: 1,
      contextVersion: 1
    };
    coordinator.observe(session);
    const requests = Array.from({ length: 24 }, () => coordinator.beforeRequest());
    await Promise.resolve();
    expect(calls).toBe(1);
    now = 5;
    release({ session: { ...session, generation: 2, serverTime: 1005, accessExpiresAt: 901_005 } });
    const snapshots = await Promise.all(requests);
    expect(new Set(snapshots.map((s) => s.generation))).toEqual(new Set([2]));
    expect(calls).toBe(1);
  });

  it('uses the latest generation for a late expired response without issuing another refresh', async () => {
    let calls = 0;
    const coordinator = new SessionCoordinator({
      now: () => 0,
      request: async () => {
        calls++;
        return { session: lifecycle() };
      }
    });
    coordinator.observe(lifecycle());
    const snapshot = await coordinator.beforeRequest();
    coordinator.observe({ ...lifecycle(), generation: 2 });
    await expect(
      coordinator.recover({ statusText: SessionErrEnum.accessExpired }, { snapshot })
    ).resolves.toBe(true);
    expect(calls).toBe(0);
  });

  it('cancels only one waiting request while another waits for the shared refresh', async () => {
    let release!: (value: { session: SessionLifecycle }) => void;
    let calls = 0;
    const coordinator = new SessionCoordinator({
      now: () => 0,
      request: () => {
        calls++;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
    });
    coordinator.observe({ ...lifecycle(), accessExpiresAt: 61_000 });
    const abort = new AbortController();
    const cancelled = coordinator.beforeRequest({ signal: abort.signal });
    const rejection = expect(cancelled).rejects.toThrow('cancel one');
    const continuing = coordinator.beforeRequest();
    abort.abort(new Error('cancel one'));
    await rejection;
    release({ session: { ...lifecycle(), generation: 2 } });
    await expect(continuing).resolves.toMatchObject({ generation: 2 });
    expect(calls).toBe(1);
  });

  it('keeps a still-valid AT after temporary pre-refresh failure and does not refresh twice for that request', async () => {
    let calls = 0;
    const failure = new Error('temporary network failure');
    const coordinator = new SessionCoordinator({
      now: () => 0,
      request: async () => {
        calls++;
        throw failure;
      }
    });
    coordinator.observe({ ...lifecycle(), accessExpiresAt: 61_000 });
    const snapshot = await coordinator.beforeRequest();
    await expect(
      coordinator.recover({ statusText: SessionErrEnum.accessExpired }, { snapshot })
    ).rejects.toBe(failure);
    await coordinator.beforeRequest();
    expect(calls).toBe(1);
    expect(coordinator.hasSession).toBe(true);
  });

  it('does not replay an old request after logout or a team context change', async () => {
    const coordinator = new SessionCoordinator({
      now: () => 0,
      request: async () => {
        throw new Error('Unexpected refresh');
      }
    });
    coordinator.observe(lifecycle());
    const snapshot = await coordinator.beforeRequest();
    coordinator.observe({ ...lifecycle(), contextVersion: 2, generation: 2 });
    await expect(
      coordinator.recover({ statusText: SessionErrEnum.accessExpired }, { snapshot })
    ).rejects.toThrow('context changed');
    coordinator.stop();
    expect(coordinator.contextHeaders).toEqual({ 'x-fastgpt-session-context': 'user:device.2' });
    await expect(coordinator.beforeRequest()).rejects.toThrow('context changed');
    coordinator.observe({ ...lifecycle(), sessionId: 'user:new-device' }, { login: true });
    expect(coordinator.contextHeaders).toEqual({
      'x-fastgpt-session-context': 'user:new-device.1'
    });
    await expect(coordinator.beforeRequest()).resolves.toMatchObject({ generation: 1 });
  });

  it('does not extend local validity when an old response repeats metadata for the same generation', async () => {
    let now = 0;
    let refreshes = 0;
    const coordinator = new SessionCoordinator({
      now: () => now,
      request: async () => {
        refreshes++;
        return {
          session: {
            ...lifecycle(),
            generation: 2,
            serverTime: 841_000,
            accessExpiresAt: 1_741_000
          }
        };
      }
    });
    coordinator.observe(lifecycle());
    now = 840_000;
    coordinator.observe(lifecycle());
    await expect(coordinator.beforeRequest()).resolves.toMatchObject({ generation: 2 });
    expect(refreshes).toBe(1);
  });

  it('does not release a waiting write when refresh discovers a new login or team context', async () => {
    const coordinator = new SessionCoordinator({
      now: () => 0,
      request: async () => ({
        session: { ...lifecycle(), contextVersion: 2, generation: 2 }
      })
    });
    coordinator.observe({ ...lifecycle(), accessExpiresAt: 31_000 });
    await expect(coordinator.beforeRequest()).rejects.toThrow('context changed');
  });

  it('requires identity reload instead of silently adopting another tab team during status synchronization', async () => {
    let reloads = 0;
    const coordinator = new SessionCoordinator({
      now: () => 0,
      onContextChanged: () => {
        reloads++;
      },
      request: async () => ({ session: { ...lifecycle(), contextVersion: 2, generation: 2 } })
    });
    coordinator.observe(lifecycle());
    await expect(coordinator.synchronize()).rejects.toThrow('context changed');
    await expect(coordinator.beforeRequest()).rejects.toThrow('context changed');
    expect(reloads).toBe(1);
  });

  it('checks the current Cookie identity before treating a late terminal error as logout', async () => {
    let reloads = 0;
    const coordinator = new SessionCoordinator({
      now: () => 0,
      onContextChanged: () => {
        reloads++;
      },
      request: async () => ({ session: { ...lifecycle(), sessionId: 'user:new-device' } })
    });
    coordinator.observe(lifecycle());
    const snapshot = await coordinator.beforeRequest();
    await expect(
      coordinator.recover({ statusText: SessionErrEnum.revoked }, { snapshot })
    ).rejects.toThrow('context changed');
    expect(reloads).toBe(1);
  });

  it.each([true, false])(
    'reloads across a legacy / modern Cookie identity transition (legacy first: %s)',
    async (legacyFirst) => {
      let reloads = 0;
      const coordinator = new SessionCoordinator({
        now: () => 0,
        onContextChanged: () => {
          reloads++;
        },
        request: async () => ({ session: legacyFirst ? lifecycle() : null })
      });
      coordinator.observe(legacyFirst ? null : lifecycle());
      await expect(coordinator.synchronize()).rejects.toThrow('context changed');
      expect(reloads).toBe(1);
    }
  );

  it('discards old successful reads while accepting the committed team response and ordinary rotation', async () => {
    const coordinator = new SessionCoordinator({ request: async () => ({ session: lifecycle() }) });
    coordinator.observe(lifecycle());
    const snapshot = await coordinator.beforeRequest();
    coordinator.observe({ ...lifecycle(), generation: 2 });
    expect(() => coordinator.assertResponseContext(snapshot)).not.toThrow();
    const switched = { ...lifecycle(), contextVersion: 2, generation: 3 };
    coordinator.observe(switched);
    expect(() => coordinator.assertResponseContext(snapshot)).toThrow('context changed');
    expect(() =>
      coordinator.assertResponseContext(snapshot, JSON.stringify(switched))
    ).not.toThrow();
    coordinator.observe({ ...lifecycle(), sessionId: 'user:new-device' }, { login: true });
    expect(() => coordinator.assertResponseContext(snapshot, JSON.stringify(switched))).toThrow(
      'context changed'
    );
    coordinator.observe(switched);
    coordinator.observe(null);
    expect(coordinator.contextHeaders).toEqual({
      'x-fastgpt-session-context': 'user:new-device.1'
    });
  });
  it.each(['login', 'team'] as const)(
    'does not attach new %s requests to prior-epoch status initialization',
    async (change) => {
      let release!: (value: { session: SessionLifecycle }) => void;
      const coordinator = new SessionCoordinator({
        now: () => 0,
        request: () =>
          new Promise((resolve) => {
            release = resolve;
          })
      });
      coordinator.observe(lifecycle());
      const oldStatus = coordinator.synchronize();
      const oldRejection = expect(oldStatus).rejects.toThrow('context changed');
      if (change === 'login') coordinator.stop();
      coordinator.observe(
        {
          ...lifecycle(),
          sessionId: change === 'login' ? 'user:new-device' : 'user:device',
          contextVersion: 2
        },
        { login: change === 'login' }
      );
      let ready = false;
      const next = coordinator.beforeRequest().then(
        () => {
          ready = true;
        },
        () => {}
      );
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(ready).toBe(true);
      } finally {
        release({ session: lifecycle() });
        await oldRejection;
        await next;
      }
    }
  );
  it.each(['login', 'team'] as const)(
    'rejects an old queued request when pre-refresh fails after a %s transition',
    async (change) => {
      let reject!: (error: Error) => void;
      const coordinator = new SessionCoordinator({
        now: () => 0,
        request: () =>
          new Promise((_, fail) => {
            reject = fail;
          })
      });
      coordinator.observe({ ...lifecycle(), accessExpiresAt: 31_000 });
      const queued = coordinator.beforeRequest();
      const rejected = expect(queued).rejects.toThrow('context changed');
      coordinator.observe(
        {
          ...lifecycle(),
          sessionId: change === 'login' ? 'user:new-device' : 'user:device',
          contextVersion: 2
        },
        { login: change === 'login' }
      );
      reject(new Error('offline'));
      await rejected;
      await expect(coordinator.beforeRequest()).resolves.toMatchObject({ contextVersion: 2 });
    }
  );
});
