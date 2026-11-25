import { describe, expect, it } from 'vitest';
import {
  SANDBOX_WS_BACKOFF_DELAYS_MS,
  SANDBOX_WS_FAST_RECONNECT_ATTEMPTS,
  SANDBOX_WS_FAST_RECONNECT_DELAY_MS,
  createSandboxReconnectController,
  getSandboxReconnectDelay,
  getSandboxWsEndpointForLog
} from '@/pageComponents/chat/SandboxEditor/reconnect';

describe('getSandboxReconnectDelay', () => {
  it('keeps the 3s interval for the first five attempts', () => {
    for (let attempts = 0; attempts < SANDBOX_WS_FAST_RECONNECT_ATTEMPTS; attempts++) {
      expect(getSandboxReconnectDelay(attempts)).toBe(SANDBOX_WS_FAST_RECONNECT_DELAY_MS);
    }
  });

  it('switches to exponential backoff and caps at 60s', () => {
    expect(getSandboxReconnectDelay(5)).toBe(10000);
    expect(getSandboxReconnectDelay(6)).toBe(20000);
    expect(getSandboxReconnectDelay(7)).toBe(40000);
    expect(getSandboxReconnectDelay(8)).toBe(60000);
    expect(getSandboxReconnectDelay(9)).toBe(60000);
    expect(getSandboxReconnectDelay(100)).toBe(60000);
  });

  it('never gives up: every attempt still returns a positive delay', () => {
    for (let attempts = 0; attempts < 1000; attempts++) {
      expect(getSandboxReconnectDelay(attempts)).toBeGreaterThan(0);
    }
  });

  it('exposes the documented backoff sequence', () => {
    expect(SANDBOX_WS_BACKOFF_DELAYS_MS).toEqual([10000, 20000, 40000, 60000]);
  });
});

describe('createSandboxReconnectController', () => {
  it('still schedules a retry after five consecutive closes (TD2026112400254)', () => {
    const controller = createSandboxReconnectController();

    const fastDelays = Array.from({ length: SANDBOX_WS_FAST_RECONNECT_ATTEMPTS }, () =>
      controller.nextDelay()
    );
    expect(fastDelays).toEqual([3000, 3000, 3000, 3000, 3000]);

    // 第 6 次失败仍会安排重连，且进入 10s 退避，不再是“已停止尝试”。
    expect(controller.nextDelay()).toBe(10000);
    expect(controller.getAttempts()).toBe(6);

    // 继续失败也只是退避到 60s，重试能力始终存在。
    expect(controller.nextDelay()).toBe(20000);
    expect(controller.nextDelay()).toBe(40000);
    expect(controller.nextDelay()).toBe(60000);
    expect(controller.nextDelay()).toBe(60000);
  });

  it('resets the attempt counter once the socket opens', () => {
    const controller = createSandboxReconnectController();
    for (let i = 0; i < 12; i++) controller.nextDelay();
    expect(controller.getAttempts()).toBe(12);

    controller.onOpen();

    expect(controller.getAttempts()).toBe(0);
    expect(controller.nextDelay()).toBe(3000);
  });

  it('notifies only once per outage when entering backoff', () => {
    const controller = createSandboxReconnectController();
    // 前 4 次失败仍在快速重试阶段，不提示。
    for (let i = 0; i < SANDBOX_WS_FAST_RECONNECT_ATTEMPTS - 1; i++) {
      controller.nextDelay();
      expect(controller.shouldNotifyRecovering()).toBe(false);
    }

    // 第 5 次失败后进入指数退避，提示“正在自动重连”，且只提示一次。
    controller.nextDelay();
    expect(controller.shouldNotifyRecovering()).toBe(true);
    expect(controller.shouldNotifyRecovering()).toBe(false);

    // 继续失败仍是重试，不会重复提示。
    controller.nextDelay();
    expect(controller.shouldNotifyRecovering()).toBe(false);

    // 重连成功后再次中断，允许重新提示一次。
    controller.onOpen();
    for (let i = 0; i < SANDBOX_WS_FAST_RECONNECT_ATTEMPTS; i++) controller.nextDelay();
    expect(controller.shouldNotifyRecovering()).toBe(true);
  });

  it('keeps retrying while the sandbox is still preparing', () => {
    // preparing 分支复用同一状态机，安排下一次握手而不是直接放弃。
    const controller = createSandboxReconnectController();
    const delay = controller.nextDelay();
    expect(delay).toBe(3000);
    expect(controller.getAttempts()).toBe(1);
  });
});

describe('getSandboxWsEndpointForLog', () => {
  it('keeps protocol, host and path while dropping ticket query params', () => {
    expect(
      getSandboxWsEndpointForLog('wss://10.109.96.139:8443/sandbox/fs?ticket=secret-token')
    ).toBe('wss://10.109.96.139:8443/sandbox/fs');
  });

  it('never leaks the query string, even for long tickets', () => {
    const endpoint = getSandboxWsEndpointForLog('wss://h/p?ticket=abc123&x=1');
    expect(endpoint).not.toContain('ticket');
    expect(endpoint).not.toContain('abc123');
  });

  it('falls back to a placeholder for malformed URLs', () => {
    expect(getSandboxWsEndpointForLog('not a url')).toBe('invalid-url');
  });
});
