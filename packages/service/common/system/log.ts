import dayjs from 'dayjs';
import chalk from 'chalk';
import { LogLevelEnum } from './log/constant';
import { connectionMongo } from '../mongo/index';
import { getMongoLog } from './log/schema';
import { getLogger } from '../otel/log';

export enum EventTypeEnum {
  outLinkBot = '[Outlink bot]',
  feishuBot = '[Feishu bot]',
  wxOffiaccount = '[Offiaccount bot]'
}

const logger = getLogger();

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
  debug: LogLevelEnum.debug,
  info: LogLevelEnum.info,
  warn: LogLevelEnum.warn,
  error: LogLevelEnum.error
};

const { LOG_LEVEL, STORE_LOG_LEVEL, SIGNOZ_STORE_LEVEL } = (() => {
  const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLocaleLowerCase();
  const STORE_LOG_LEVEL = (process.env.STORE_LOG_LEVEL || '').toLocaleLowerCase();
  const SIGNOZ_STORE_LEVEL = (process.env.SIGNOZ_STORE_LEVEL || 'warn').toLocaleLowerCase();

  return {
    LOG_LEVEL: envLogLevelMap[LOG_LEVEL] ?? LogLevelEnum.info,
    STORE_LOG_LEVEL: envLogLevelMap[STORE_LOG_LEVEL] ?? 99,
    SIGNOZ_STORE_LEVEL: envLogLevelMap[SIGNOZ_STORE_LEVEL] ?? LogLevelEnum.warn
  };
})();

/* add logger */
export const addLog = {
  log(level: LogLevelEnum, msg: string, obj: Record<string, any> = {}) {
    if (level < LOG_LEVEL) return;

    const stringifyObj = JSON.stringify(obj);
    const isEmpty = Object.keys(obj).length === 0;

    console.log(
      `${logMap[level].levelLog} ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${msg} ${
        level !== LogLevelEnum.error && !isEmpty ? stringifyObj : ''
      }`
    );

    level === LogLevelEnum.error && console.error(obj);

    if (logger && level >= SIGNOZ_STORE_LEVEL) {
      logger.emit({
        severityNumber: level.valueOf(),
        severityText: ['debug', 'info', 'warn', 'error'][level],
        body: {
          msg,
          obj
        }
      });
    }

    // store log
    if (level >= STORE_LOG_LEVEL && connectionMongo.connection.readyState === 1) {
      (async () => {
        try {
          await getMongoLog().create({
            text: msg,
            level,
            metadata: obj
          });
        } catch (error) {
          console.error('store log error', error);
        }
      })();
    }
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
