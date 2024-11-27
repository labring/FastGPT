import dayjs from 'dayjs';
import chalk from 'chalk';
import { LogLevelEnum } from './log/constant';
import { connectionMongo } from '../mongo/index';
import { getMongoLog } from './log/schema';
import { LoginStatusEnum, LoginTypeEnum } from './loginLog/constant';
import { getLoginLog } from './loginLog/schema';

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

const { LOG_LEVEL, STORE_LOG_LEVEL } = (() => {
  const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLocaleLowerCase();
  const STORE_LOG_LEVEL = (process.env.STORE_LOG_LEVEL || '').toLocaleLowerCase();

  return {
    LOG_LEVEL: envLogLevelMap[LOG_LEVEL] ?? LogLevelEnum.info,
    STORE_LOG_LEVEL: envLogLevelMap[STORE_LOG_LEVEL] ?? 99
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

    // store
    if (level >= STORE_LOG_LEVEL && connectionMongo.connection.readyState === 1) {
      // store log
      getMongoLog().create({
        text: msg,
        level,
        metadata: obj
      });
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

/* add login logger */
export const addLoginLog = {
  log(userName: string, type: LoginTypeEnum, status: LoginStatusEnum, message: string) {
    console.log(`${userName} ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${type} ${status}`);
    // store
    getLoginLog().create({
      userName: userName,
      type: type,
      status: status,
      message: message
    });
  },
  login(userName: string, status: LoginStatusEnum, message: string) {
    this.log(userName, LoginTypeEnum.login, status, message);
  },
  logout(userName: string, status: LoginStatusEnum, message: string) {
    this.log(userName, LoginTypeEnum.logout, status, message);
  }
};

/* check15分钟内失败的登录记录，5条以上就锁定账号 */
export default async function isLoginLocked(userName: string) {
  try {
    var fifteenMinutesAgo = new Date(new Date().getTime() - 15 * 60 * 1000);
    const listParam: any = {
      $and: [
        { userName: userName },
        { type: LoginTypeEnum.login },
        { time: { $gt: fifteenMinutesAgo } }
      ]
    };
    // 分页查询
    const loginLogList = await getLoginLog()
      .find(listParam)
      .skip(0)
      .limit(5)
      .sort({
        time: -1
      })
      .exec();
    if (loginLogList.length < 5) {
      return false;
    }
    for (let i = 0; i < loginLogList.length; i++) {
      if (loginLogList[i].status === LoginStatusEnum.success) {
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}
