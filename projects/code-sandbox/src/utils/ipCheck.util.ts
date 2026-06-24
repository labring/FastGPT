import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';
import { env } from '../env';

const truthyEnvValues = new Set(['true', '1', 'yes', 'y']);

const { isInternalAddress, isInternalResolvedIP } = createInternalAddressChecker({
  checkInternalIp: () => {
    const raw = process.env.CHECK_INTERNAL_IP;
    return raw === undefined ? env.CHECK_INTERNAL_IP : truthyEnvValues.has(raw.toLowerCase());
  }
});

export { isInternalAddress, isInternalResolvedIP, PRIVATE_URL_TEXT };
