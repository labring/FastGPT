import { getLocationFromIp } from '@fastgpt/service/common/geo';
import { describe, expect, it } from 'vitest';

describe('Get Location From IP', () => {
  it('should return the `Other` when the ip is loopback address', () => {
    const ip = '::1';
    const locationEn = getLocationFromIp(ip, 'en');
    const locationZh = getLocationFromIp(ip, 'zh');

    expect(locationEn).toBe('Other');
    expect(locationZh).toBe('其他');
  });

  it('should return the `Other` when the ip is private address', () => {
    const ip = '192.168.0.1';
    const locationEn = getLocationFromIp(ip, 'en');
    const locationZh = getLocationFromIp(ip, 'zh');

    expect(locationEn).toBe('Other');
    expect(locationZh).toBe('其他');
  });

  it('should return the `Other` when the ip is invalid', () => {
    const ip = 'Invalid';
    const locationEn = getLocationFromIp(ip, 'en');
    const locationZh = getLocationFromIp(ip, 'zh');

    expect(locationEn).toBe('Other');
    expect(locationZh).toBe('其他');
  });

  it('should only return the country name', () => {
    const ip = '8.8.8.8';
    const locationEn = getLocationFromIp(ip, 'en');
    const locationZh = getLocationFromIp(ip, 'zh');

    const ipv6 = '2001:4860:4860::8888';
    const locationEnIpv6 = getLocationFromIp(ipv6, 'en');
    const locationZhIpv6 = getLocationFromIp(ipv6, 'zh');

    expect(locationEn).toBe('United States');
    expect(locationZh).toBe('美国');
    expect(locationEnIpv6).toBe('United States');
    expect(locationZhIpv6).toBe('美国');
  });

  it('should return full location name', () => {
    const ip = '223.5.5.5';
    const locationEn = getLocationFromIp(ip, 'en');
    const locationZh = getLocationFromIp(ip, 'zh');

    const ipv6 = '2400:3200:baba::1';
    const locationEnIpv6 = getLocationFromIp(ipv6, 'en');
    const locationZhIpv6 = getLocationFromIp(ipv6, 'zh');

    expect(locationEn).toBe('China, Zhejiang, Hangzhou');
    expect(locationZh).toBe('中国，浙江，杭州');
    expect(locationEnIpv6).toBe('China, Zhejiang, Hangzhou');
    expect(locationZhIpv6).toBe('中国，浙江，杭州');
  });
});
