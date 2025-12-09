import type { City } from '@maxmind/geoip2-node';

export function extractLocationData(response: City) {
  return {
    city: {
      id: response.city?.geonameId,
      en: response.city?.names.en,
      zh: response.city?.names['zh-CN']
    },
    country: {
      id: response.country?.geonameId,
      en: response.country?.names.en,
      zh: response.country?.names['zh-CN']
    },
    province: {
      id: response.subdivisions?.[0]?.geonameId,
      en: response.subdivisions?.[0]?.names.en,
      zh: response.subdivisions?.[0]?.names['zh-CN']
    }
  };
}
