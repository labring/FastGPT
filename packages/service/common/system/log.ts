import dayjs from 'dayjs';
import chalk from 'chalk';
import { LogLevelEnum } from './log/constant';
import { connectionMongo } from '../mongo/index';
import { getMongoLog } from './log/schema';
import { getLogger } from '../otel/log';
import { getErrText } from '@fastgpt/global/common/error/utils';

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

/**
 * Sanitize object to prevent circular references for BSON serialization
 * Remove properties that may contain circular references
 */
const sanitizeObjectForBSON = (obj: Record<string, any>): Record<string, any> => {
  try {
    // Use JSON stringify with replacer to handle circular references
    const seen = new WeakSet();
    const sanitized = JSON.parse(
      JSON.stringify(obj, (key, value) => {
        // Handle circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }

        // Remove known problematic properties from axios config
        if (key === 'config' && value && typeof value === 'object') {
          return {
            method: value.method,
            url: value.url,
            baseURL: value.baseURL,
            headers: value.headers,
            timeout: value.timeout,
            responseType: value.responseType
          };
        }

        // Remove functions and other non-serializable values
        if (typeof value === 'function' || typeof value === 'symbol') {
          return undefined;
        }

        return value;
      })
    );
    return sanitized;
  } catch (error) {
    // If sanitization fails, return a safe fallback
    return {
      error: 'Failed to sanitize object',
      originalKeys: Object.keys(obj)
    };
  }
};

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
          // Sanitize metadata to prevent circular reference errors
          const safeMetadata = sanitizeObjectForBSON(obj);

          await getMongoLog().create({
            text: msg,
            level,
            metadata: safeMetadata
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
      ...(error?.data && { data: error?.data }),
      message: getErrText(error),
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
