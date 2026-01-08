import fs from 'node:fs';
import type { ReaderModel } from '@maxmind/geoip2-node';
import { Reader } from '@maxmind/geoip2-node';
import { cleanupIntervalMs, dbPath, privateOrOtherLocationName } from './constants';
import type { LocationName } from './type';
import { extractLocationData } from './utils';
import type { NextApiRequest } from 'next';
import { getClientIp } from 'request-ip';
import { addLog } from '../system/log';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { formatI18nLocationToZhEn } from '@fastgpt/global/common/i18n/utils';

let reader: ReaderModel | null = null;

const locationIpMap = new Map<string, LocationName>();

function loadGeoDB() {
  const dbBuffer = fs.readFileSync(dbPath);
  reader = Reader.openBuffer(dbBuffer);
  return reader;
}

export function getGeoReader() {
  if (!reader) {
    return loadGeoDB();
  }
  return reader;
}

export function getLocationFromIp(ip?: string, locale: localeType = 'zh-CN') {
  const formatedLocale = formatI18nLocationToZhEn(locale);

  if (!ip) {
    return privateOrOtherLocationName.country?.[formatedLocale];
  }
  const reader = getGeoReader();

  let locationName = locationIpMap.get(ip);
  if (locationName) {
    return [
      locationName.country?.[formatedLocale],
      locationName.province?.[formatedLocale],
      locationName.city?.[formatedLocale]
    ]
      .filter(Boolean)
      .join(formatedLocale === 'zh' ? '，' : ',');
  }

  try {
    const response = reader.city(ip);
    const data = extractLocationData(response);
    locationName = {
      city: {
        en: data.city.en,
        zh: data.city.zh
      },
      country: {
        en: data.country.en,
        zh: data.country.zh
      },
      province: {
        en: data.province.en,
        zh: data.province.zh
      }
    };
    locationIpMap.set(ip, locationName);

    return [
      locationName.country?.[formatedLocale],
      locationName.province?.[formatedLocale],
      locationName.city?.[formatedLocale]
    ]
      .filter(Boolean)
      .join(formatedLocale === 'zh' ? '，' : ', ');
  } catch (error) {
    locationIpMap.set(ip, privateOrOtherLocationName);
    return privateOrOtherLocationName.country?.[formatedLocale];
  }
}

let cleanupInterval: NodeJS.Timeout | null = null;
function cleanupIpMap() {
  locationIpMap.clear();
}

export function clearCleanupInterval() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export function initGeo() {
  cleanupInterval = setInterval(cleanupIpMap, cleanupIntervalMs);

  try {
    loadGeoDB();
  } catch (error) {
    clearCleanupInterval();
    addLog.error(`Failed to load geo db`, error);
    throw error;
  }
}

export function getIpFromRequest(request: NextApiRequest): string {
  const ip = getClientIp(request);
  if (!ip || ip === '::1') {
    return '127.0.0.1';
  }
  return ip;
}
