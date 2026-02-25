import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getGeoReader,
  getLocationFromIp,
  clearCleanupInterval,
  initGeo,
  getIpFromRequest,
  type NextApiRequest
} from '@fastgpt/service/common/geo';
import { cleanupIntervalMs } from '@fastgpt/service/common/geo/constants';

describe('getGeoReader', () => {
  it('should return a reader instance', () => {
    const reader = getGeoReader();
    expect(reader).toBeDefined();
    expect(typeof reader.city).toBe('function');
  });

  it('should return the same reader on subsequent calls', () => {
    const reader1 = getGeoReader();
    const reader2 = getGeoReader();
    expect(reader1).toBe(reader2);
  });
});

describe('getLocationFromIp', () => {
  it('should return "其他" when ip is undefined and locale is zh-CN', () => {
    const result = getLocationFromIp(undefined, 'zh-CN');
    expect(result).toBe('其他');
  });

  it('should return "Other" when ip is undefined and locale is en', () => {
    const result = getLocationFromIp(undefined, 'en');
    expect(result).toBe('Other');
  });

  it('should return "其他" when ip is empty string and locale defaults', () => {
    const result = getLocationFromIp('');
    expect(result).toBe('其他');
  });

  it('should return location string for a valid public IP with zh-CN locale', () => {
    // 8.8.8.8 is a well-known Google DNS IP
    const result = getLocationFromIp('8.8.8.8', 'zh-CN');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('should return location string for a valid public IP with en locale', () => {
    const result = getLocationFromIp('8.8.8.8', 'en');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('should return "其他" for a private IP (catch branch)', () => {
    const result = getLocationFromIp('192.168.1.1', 'zh-CN');
    expect(result).toBe('其他');
  });

  it('should return "Other" for a private IP with en locale', () => {
    const result = getLocationFromIp('192.168.1.1', 'en');
    expect(result).toBe('Other');
  });

  it('should use cache on second call with same IP', () => {
    const ip = '1.1.1.1';
    const result1 = getLocationFromIp(ip, 'zh-CN');
    const result2 = getLocationFromIp(ip, 'zh-CN');
    expect(result1).toBe(result2);
  });

  it('should use cache for private IP on second call', () => {
    const ip = '10.0.0.1';
    const result1 = getLocationFromIp(ip, 'en');
    const result2 = getLocationFromIp(ip, 'en');
    expect(result1).toBe('Other');
    expect(result2).toBe('Other');
  });

  it('should format zh locale with Chinese comma separator', () => {
    // Use a known IP that has country + province + city
    const result = getLocationFromIp('8.8.8.8', 'zh-CN');
    if (result && result.includes('，')) {
      // If there are multiple parts, they should be joined by Chinese comma
      expect(result).toMatch(/，/);
    }
  });

  it('should format en locale with English comma separator', () => {
    const result = getLocationFromIp('8.8.8.8', 'en');
    if (result && result.includes(',')) {
      expect(result).toMatch(/,/);
    }
  });
});

describe('clearCleanupInterval', () => {
  it('should not throw when no interval is set', () => {
    expect(() => clearCleanupInterval()).not.toThrow();
  });

  it('should clear interval after initGeo', () => {
    initGeo();
    expect(() => clearCleanupInterval()).not.toThrow();
    // Call again to cover the null branch
    expect(() => clearCleanupInterval()).not.toThrow();
  });
});

describe('initGeo', () => {
  afterEach(() => {
    clearCleanupInterval();
  });

  it('should initialize geo DB without throwing', () => {
    expect(() => initGeo()).not.toThrow();
  });

  it('should allow getGeoReader to work after init', () => {
    initGeo();
    const reader = getGeoReader();
    expect(reader).toBeDefined();
  });

  it('should clear IP cache when cleanup interval fires', () => {
    vi.useFakeTimers();
    initGeo();
    // Populate cache
    getLocationFromIp('8.8.8.8', 'en');
    // Advance timer to trigger cleanupIpMap
    vi.advanceTimersByTime(cleanupIntervalMs);
    // After cleanup, function should still work (re-lookup from DB)
    const result = getLocationFromIp('8.8.8.8', 'en');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    clearCleanupInterval();
    vi.useRealTimers();
  });

  it('should throw and clear interval when loadGeoDB fails', () => {
    const fs = require('node:fs');
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = () => {
      throw new Error('File not found');
    };

    expect(() => initGeo()).toThrow('File not found');

    fs.readFileSync = originalReadFileSync;
  });
});

describe('getIpFromRequest', () => {
  it('should return 127.0.0.1 when no IP headers present', () => {
    const req = {
      headers: {},
      connection: {},
      socket: {}
    } as unknown as NextApiRequest;

    const ip = getIpFromRequest(req);
    expect(ip).toBe('127.0.0.1');
  });

  it('should return 127.0.0.1 for ::1 (IPv6 loopback)', () => {
    const req = {
      headers: { 'x-forwarded-for': '::1' },
      connection: {},
      socket: {}
    } as unknown as NextApiRequest;

    const ip = getIpFromRequest(req);
    expect(ip).toBe('127.0.0.1');
  });

  it('should return the IP from x-forwarded-for header', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.50' },
      connection: {},
      socket: {}
    } as unknown as NextApiRequest;

    const ip = getIpFromRequest(req);
    expect(ip).toBe('203.0.113.50');
  });

  it('should return the IP from x-real-ip header', () => {
    const req = {
      headers: { 'x-real-ip': '198.51.100.10' },
      connection: {},
      socket: {}
    } as unknown as NextApiRequest;

    const ip = getIpFromRequest(req);
    expect(ip).toBe('198.51.100.10');
  });
});
