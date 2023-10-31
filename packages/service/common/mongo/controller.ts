/* add logger */
export const addLog = {
  info: (msg: string, obj?: Record<string, any>) => {
    global.logger?.info(msg, { meta: obj });
  },
  error: (msg: string, error?: any) => {
    global.logger?.error(msg, {
      meta: {
        stack: error?.stack,
        ...(error?.config && {
          config: {
            headers: error.config.headers,
            url: error.config.url,
            data: error.config.data
          }
        }),
        ...(error?.response && {
          response: {
            status: error.response.status,
            statusText: error.response.statusText
          }
        })
      }
    });
  }
};
