import FingerprintJS from '@fingerprintjs/fingerprintjs';

const fpPromise = FingerprintJS.load();

export const getUserFingerprint = async () => {
  const fp = await fpPromise;
  const result = await fp.get();
  console.log(result.visitorId);
};
