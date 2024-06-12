import dayjs from 'dayjs';
import chalk from 'chalk';
import { isProduction } from './constants';

enum LogLevelEnum {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3
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
const envLogLevelMap: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const logLevel = (() => {
  if (!isProduction) return LogLevelEnum.debug;
  const envLogLevel = (process.env.LOG_LEVEL || 'info').toLocaleLowerCase();
  if (!envLogLevel || envLogLevelMap[envLogLevel] === undefined) return LogLevelEnum.info;
  return envLogLevelMap[envLogLevel];
})();

/* add logger */
export const addLog = {
  log(level: LogLevelEnum, msg: string, obj: Record<string, any> = {}) {
    if (level < logLevel) return;

    const stringifyObj = JSON.stringify(obj);
    const isEmpty = Object.keys(obj).length === 0;

    console.log(
      `${logMap[level].levelLog} ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${msg} ${
        level !== LogLevelEnum.error && !isEmpty ? stringifyObj : ''
      }`
    );

    level === LogLevelEnum.error && console.error(obj);

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
