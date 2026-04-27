import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LocationName } from './type';

const dbFileName = 'GeoLite2-City.mmdb';
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const dbPathCandidates = [
  path.resolve(currentDir, '../../../../projects/app/data', dbFileName),
  path.resolve(process.cwd(), 'data', dbFileName),
  path.resolve(process.cwd(), '../../projects/app/data', dbFileName)
];

export const dbPath = dbPathCandidates.find((item) => fs.existsSync(item)) ?? dbPathCandidates[0];

export const privateOrOtherLocationName: LocationName = {
  city: undefined,
  country: {
    en: 'Other',
    zh: '其他'
  },
  province: undefined
};

export const cleanupIntervalMs = 6 * 60 * 60 * 1000; // Run cleanup every 6 hours
