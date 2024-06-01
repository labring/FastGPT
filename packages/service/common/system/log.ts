import dayjs from 'dayjs';
import chalk from 'chalk';

enum LogLevelEnum {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error'
}
const logMap = {
  [LogLevelEnum.debug]: {
    levelLog: chalk.green('[Debug]')
  },
  [LogLevelEnum.info]: {
    levelLog: chalk.blue('[Info]')
  },
  [LogLevelEnum.warn]: {
    levelLog: chalk.yellow('[Warn]')
  },
  [LogLevelEnum.error]: {
    levelLog: chalk.red('[Error]')
  }
};

/* add logger */
export const addLog = {
  log(level: LogLevelEnum, msg: string, obj: Record<string, any> = {}) {
    const stringifyObj = JSON.stringify(obj);
    const isEmpty = Object.keys(obj).length === 0;

    console.log(
      `${logMap[level].levelLog} ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${msg} ${
        level !== 'error' && !isEmpty ? stringifyObj : ''
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
  debug(msg: string, obj?: Record<string, any>) {
    this.log(LogLevelEnum.debug, msg, obj);
  },
  info(msg: string, obj?: Record<string, any>) {
    this.log(LogLevelEnum.info, msg, obj);
  },
  warn(msg: string, obj?: Record<string, any>) {
    this.log(LogLevelEnum.warn, msg, obj);
  },
  error(msg: string, error?: any) {
    this.log(LogLevelEnum.error, msg, {
      message: error?.message || error,
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
