export enum LogLevelEnum {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3
}

export const LogLevelEnumReverse = {
  [LogLevelEnum.debug]: 'debug',
  [LogLevelEnum.info]: 'info',
  [LogLevelEnum.warn]: 'warn',
  [LogLevelEnum.error]: 'error'
};

export enum LogSignEnum {
  slowOperation = 'slowOperation'
}
