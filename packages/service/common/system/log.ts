import { LogLevelEnum } from './log/constant';
import { getLogger, mod } from '../logger';
import { getErrText } from '@fastgpt/global/common/error/utils';

export enum EventTypeEnum {
  outLinkBot = '[Outlink bot]',
  feishuBot = '[Feishu bot]',
  wxOffiaccount = '[Offiaccount bot]'
}

const logger = getLogger(mod.common);
const envLogLevelMap: Record<string, number> = {
  debug: LogLevelEnum.debug,
  info: LogLevelEnum.info,
  warn: LogLevelEnum.warn,
  error: LogLevelEnum.error
};

const { LOG_LEVEL } = (() => {
  const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLocaleLowerCase();

  return {
    LOG_LEVEL: envLogLevelMap[LOG_LEVEL] ?? LogLevelEnum.info
  };
})();

/* add logger */
export const addLog = {
  log(level: LogLevelEnum, msg: string, obj: Record<string, any> = {}) {
    if (level < LOG_LEVEL) return;

    if (level === LogLevelEnum.debug) {
      logger.debug(msg, obj);
      return;
    }
    if (level === LogLevelEnum.info) {
      logger.info(msg, obj);
      return;
    }
    if (level === LogLevelEnum.warn) {
      logger.warn(msg, obj);
      return;
    }
    logger.error(msg, obj);
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
