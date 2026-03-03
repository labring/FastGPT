import path from 'node:path';
import type { LocationName } from './type';

export const dbPath = path.join(process.cwd(), 'data/GeoLite2-City.mmdb');

export const privateOrOtherLocationName: LocationName = {
  city: undefined,
  country: {
    en: 'Other',
    zh: '其他'
  },
  province: undefined
};

export const cleanupIntervalMs = 6 * 60 * 60 * 1000; // Run cleanup every 6 hours
