import { expect, test, vi } from 'vitest';
import { main } from '..';

test('get current time', async () => {
  // Mock Date constructor to return a fixed date
  const date = new Date('2023-01-01T12:00:00.000');
  vi.useFakeTimers();
  vi.setSystemTime(date);
  const res = await main({
    formatStr: 'yyyy-MM-dd HH:mm:ss'
  });
  expect(res.output?.time).toBeDefined();
  expect(res.output?.time).toEqual('2023-01-01 12:00:00');
  vi.useRealTimers();
});

test('get current time with a invalid format', async () => {
  // Mock Date constructor to return a fixed date
  const date = new Date('2023-01-01T12:00:00.000');
  vi.useFakeTimers();
  vi.setSystemTime(date);
  const res = await main({
    formatStr: 'someFormatStrisInvalid'
  });
  expect(res.error).toBeDefined();
  expect(res.output?.time).toBeUndefined();
  vi.useRealTimers();
});
