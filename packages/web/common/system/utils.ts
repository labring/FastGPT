import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const getUserFingerprint = async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  console.log(result.visitorId);
};

export const hasHttps = () => {
  return window.location.protocol === 'https:';
};
