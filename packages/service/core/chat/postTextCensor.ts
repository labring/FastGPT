export const postTextCensor = (data: { text: string }) =>
  global
    .textCensorHandler(data)
    .then((res) => {
      if (res?.code === 5000) {
        return Promise.reject(res);
      }
    })
    .catch((err) => {
      if (err?.code === 5000) {
        return Promise.reject(err.message);
      }
      return Promise.resolve('');
    });
