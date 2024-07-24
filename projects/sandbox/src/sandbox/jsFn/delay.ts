export const timeDelay = (time: number) => {
  return new Promise((resolve, reject) => {
    if (time > 10000) {
      reject('Delay time must be less than 10');
    }
    setTimeout(() => {
      resolve('');
    }, time);
  });
};
