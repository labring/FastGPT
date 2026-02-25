import { describe, it, expect } from 'vitest';
import { extractLocationData, type City } from '@fastgpt/service/common/geo/utils';

describe('extractLocationData', () => {
  it('should extract full location data from a complete City response', () => {
    const response = {
      city: {
        geonameId: 1001,
        names: { en: 'Beijing', 'zh-CN': '北京' }
      },
      country: {
        geonameId: 2001,
        names: { en: 'China', 'zh-CN': '中国' }
      },
      subdivisions: [
        {
          geonameId: 3001,
          names: { en: 'Beijing', 'zh-CN': '北京市' }
        }
      ]
    } as unknown as City;

    const result = extractLocationData(response);

    expect(result).toEqual({
      city: { id: 1001, en: 'Beijing', zh: '北京' },
      country: { id: 2001, en: 'China', zh: '中国' },
      province: { id: 3001, en: 'Beijing', zh: '北京市' }
    });
  });

  it('should handle missing city data', () => {
    const response = {
      city: undefined,
      country: {
        geonameId: 2001,
        names: { en: 'China', 'zh-CN': '中国' }
      },
      subdivisions: [
        {
          geonameId: 3001,
          names: { en: 'Guangdong', 'zh-CN': '广东省' }
        }
      ]
    } as unknown as City;

    const result = extractLocationData(response);

    expect(result.city).toEqual({ id: undefined, en: undefined, zh: undefined });
    expect(result.country).toEqual({ id: 2001, en: 'China', zh: '中国' });
    expect(result.province).toEqual({ id: 3001, en: 'Guangdong', zh: '广东省' });
  });

  it('should handle missing country and subdivisions', () => {
    const response = {
      city: {
        geonameId: 1001,
        names: { en: 'SomeCity', 'zh-CN': '某城市' }
      },
      country: undefined,
      subdivisions: undefined
    } as unknown as City;

    const result = extractLocationData(response);

    expect(result.city).toEqual({ id: 1001, en: 'SomeCity', zh: '某城市' });
    expect(result.country).toEqual({ id: undefined, en: undefined, zh: undefined });
    expect(result.province).toEqual({ id: undefined, en: undefined, zh: undefined });
  });

  it('should handle empty subdivisions array', () => {
    const response = {
      city: {
        geonameId: 1001,
        names: { en: 'Tokyo', 'zh-CN': '东京' }
      },
      country: {
        geonameId: 2001,
        names: { en: 'Japan', 'zh-CN': '日本' }
      },
      subdivisions: []
    } as unknown as City;

    const result = extractLocationData(response);

    expect(result.province).toEqual({ id: undefined, en: undefined, zh: undefined });
  });

  it('should handle all fields undefined', () => {
    const response = {
      city: undefined,
      country: undefined,
      subdivisions: undefined
    } as unknown as City;

    const result = extractLocationData(response);

    expect(result).toEqual({
      city: { id: undefined, en: undefined, zh: undefined },
      country: { id: undefined, en: undefined, zh: undefined },
      province: { id: undefined, en: undefined, zh: undefined }
    });
  });
});
