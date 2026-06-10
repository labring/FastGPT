import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { createClientAbortTracker } from '@fastgpt/service/core/workflow/dispatch/utils/clientAbort';

const createMockReq = () =>
  Object.assign(new EventEmitter(), {
    aborted: false,
    socket: new EventEmitter()
  });

const createMockRes = () =>
  Object.assign(new EventEmitter(), {
    writableEnded: false,
    writableFinished: false,
    errored: false
  });

describe('createClientAbortTracker', () => {
  test('detects client request abort before response finish', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });

    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  test('does not treat close after normal finish as client abort', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });

    res.emit('finish');
    res.writableEnded = true;
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  test('does not treat response close after server error as client abort', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });

    res.emit('error');
    res.errored = true;
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  test('keeps client reset socket errors eligible for close fallback', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });
    const resetError = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });

    req.socket.emit('error', resetError);
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  test('keeps client reset response errors eligible for close fallback', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });
    const resetError = Object.assign(new Error('write reset'), { code: 'EPIPE' });

    res.emit('error', resetError);
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  test('keeps accepted client abort sticky after later response error', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });

    res.emit('close');
    res.emit('error');
    res.errored = true;

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  test('keeps explicit request abort even after response error', () => {
    const req = createMockReq();
    const res = createMockRes();
    const tracker = createClientAbortTracker({ req, res: res as any });

    res.emit('error');
    res.errored = true;
    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });
});
