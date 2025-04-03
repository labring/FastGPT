export const initScripts: Record<string, () => Promise<boolean>> = {
  // '4.8.21': () => {
  //   console.log('initScripts v4.8.21');
  //   return Promise.resolve(true);
  // },
  // '4.8.22': () => {
  //   console.log('initScripts v4.8.22');
  //   return Promise.resolve(true);
  // },
  // '4.8.23': () => {
  //   console.log('initScripts v4.8.23');
  //   return Promise.resolve(true);
  // },
  // '4.8.24': () => {
  //   console.log('initScripts v4.8.24');
  //   return Promise.resolve(true);
  // },
  // '4.9.0': () => {
  //   console.log('initScripts v4.9.0');
  //   return Promise.resolve(true);
  // },
  // '4.9.1': () => {
  //   console.log('initScripts v4.9.1');
  //   return Promise.resolve(true);
  // },
  // '5.0.0': () => {
  //   console.log('initScripts v5.0.0');
  //   return Promise.resolve(true);
  // }
};

export const versionList = Object.keys(initScripts);

export function compareVersion(v1: string, v2: string) {
  // 1. change v4.8.21 to 4.8.21: remove v prefix
  // 2. split by '.'
  // 3. cast to number
  const v1Arr = v1.replace('v', '').split('.').map(Number);
  const v2Arr = v2.replace('v', '').split('.').map(Number);
  for (let i = 0; i < v1Arr.length; i++) {
    if (v1Arr[i] !== v2Arr[i]) {
      return v1Arr[i] - v2Arr[i];
    }
  }
  return 0;
}

export function getNextVersion(versionNow: string) {
  const index = versionList.indexOf(versionNow);
  if (index === -1) {
    return versionList[0];
  }
  if (index === versionList.length - 1) {
    return null;
  }
  return versionList[index + 1];
}
