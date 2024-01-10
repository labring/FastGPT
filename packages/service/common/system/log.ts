import dayjs from 'dayjs';

/* add logger */
export const addLog = {
  log(level: 'info' | 'warn' | 'error', msg: string, obj: Record<string, any> = {}) {
    console.log(
      `[${level.toLocaleUpperCase()}] ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${msg} ${
        level !== 'error' ? JSON.stringify(obj) : ''
      }`
    );

    level === 'error' && console.error(obj);

    const lokiUrl = process.env.LOKI_LOG_URL as string;
    if (!lokiUrl) return;

    try {
      fetch(lokiUrl, {
        method: 'POST',
        headers: {
          'Content-type': 'application/json'
        },
        body: JSON.stringify({
          streams: [
            {
              stream: {
                level
              },
              values: [
                [
                  `${Date.now() * 1000000}`,
                  JSON.stringify({
                    message: msg,
                    ...obj
                  })
                ]
              ]
            }
          ]
        })
      });
    } catch (error) {}
  },
  info(msg: string, obj?: Record<string, any>) {
    this.log('info', msg, obj);
  },
  warn(msg: string, obj?: Record<string, any>) {
    this.log('warn', msg, obj);
  },
  error(msg: string, error?: any) {
    this.log('error', msg, {
      message: error?.message,
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
    });
  }
};
