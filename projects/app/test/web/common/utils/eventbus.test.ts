import { describe, it, expect, vi } from 'vitest';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';

describe('eventBus', () => {
  it('should register event handler with on()', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.sendQuestion, handler);

    expect(eventBus.list.get(EventNameEnum.sendQuestion)).toBe(handler);
  });

  it('should emit event with data', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.sendQuestion, handler);

    const data = { question: 'test' };
    eventBus.emit(EventNameEnum.sendQuestion, data);

    expect(handler).toHaveBeenCalledWith(data);
  });

  it('should emit event without data', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.editQuestion, handler);

    eventBus.emit(EventNameEnum.editQuestion);

    expect(handler).toHaveBeenCalledWith({});
  });

  it('should remove event handler with off()', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.openQuoteReader, handler);
    eventBus.off(EventNameEnum.openQuoteReader);

    expect(eventBus.list.has(EventNameEnum.openQuoteReader)).toBe(false);
  });

  it('should not call handler after off()', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.sendQuestion, handler);
    eventBus.off(EventNameEnum.sendQuestion);

    eventBus.emit(EventNameEnum.sendQuestion, { test: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle non-existent event emission', () => {
    expect(() => {
      eventBus.emit(EventNameEnum.editQuestion);
    }).not.toThrow();
  });
});
