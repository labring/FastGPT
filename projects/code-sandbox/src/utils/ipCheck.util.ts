import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';

const truthyEnvValues = new Set(['true', '1', 'yes', 'y']);

const { isInternalAddress, isInternalResolvedIP } = createInternalAddressChecker({
  checkInternalIp: () => truthyEnvValues.has((process.env.CHECK_INTERNAL_IP || '').toLowerCase())
});

export { isInternalAddress, isInternalResolvedIP, PRIVATE_URL_TEXT };
