import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDateWithOffset,
  getFixedOffsetMilliseconds
} from '@fastgpt/global/common/time/fixedOffset';

describe('getFixedOffsetMilliseconds', () => {
  it('parses positive, negative, fractional and zero offsets', () => {
    for (const [offset, minutes] of [
      ['+08:00', 480],
      ['-05:00', -300],
      ['+05:45', 345],
      ['+00:00', 0]
    ] as const) {
      expect(getFixedOffsetMilliseconds(offset)).toBe(minutes * 60_000);
    }
  });
  it('rejects malformed offsets and IANA names', () => {
    for (const offset of ['', 'America/New_York', '+24:00', '+08:60']) {
      expect(() => getFixedOffsetMilliseconds(offset)).toThrow(RangeError);
    }
  });
});

describe('formatDateWithOffset', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    { server: 'UTC', nativeOffset: 0 },
    { server: 'Asia/Shanghai', nativeOffset: -480 },
    { server: 'America/New_York', nativeOffset: 240 }
  ])(
    'keeps fixed-offset calendar fields independent of server DST: $server',
    ({ server, nativeOffset }) => {
      vi.stubEnv('TZ', server);
      // 验证运行器确实切换了原生 Date 的时区，不能只修改 worker 的 process.env 得到假阳性。
      expect(new Date('2026-03-08T07:30:00Z').getTimezoneOffset()).toBe(nativeOffset);
      for (const [iso, offset, expected] of [
        ['2026-03-08T07:30:00Z', '-05:00', '2026-03-08 02:30:00'],
        ['2026-03-08T05:00:00Z', '+08:00', '2026-03-08 13:00:00'],
        ['2026-11-01T06:30:00Z', '+05:45', '2026-11-01 12:15:00']
      ]) {
        for (const time of [iso, new Date(iso), new Date(iso).getTime()]) {
          expect(formatDateWithOffset({ time, offset, format: 'YYYY-MM-DD HH:mm:ss' })).toBe(
            expected
          );
        }
      }
      const local = '2026-03-08T03:30:00';
      expect(
        formatDateWithOffset({ time: local, offset: '+00:00', format: 'YYYY-MM-DD HH:mm:ss' })
      ).toBe(new Date(local).toISOString().slice(0, 19).replace('T', ' '));
    }
  );
});
