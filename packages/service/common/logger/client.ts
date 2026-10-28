import {
  configureLoggerFromEnv,
  disposeLogger,
  getLogger as getSdkLogger
} from '@fastgpt-sdk/otel/logger';
import { isUserConfigError } from '@fastgpt/global/common/error/utils';

export async function configureLogger() {
  const { serviceEnv } = await import('../../env');

  await configureLoggerFromEnv({
    env: serviceEnv,
    defaultCategory: ['system'],
    defaultServiceName: 'fastgpt-client'
  });
}

/**
 * 统一将结构化 error 中的用户配置错误降为 info，并阻止 OTel 导出。
 * 只识别直接传入的错误，不沿 cause 查找，避免把包含配置错误的系统异常误降级。
 * 普通日志、惰性属性和模板字符串沿用 SDK 行为；派生 logger 同样应用该规则。
 */
export function getLogger(category?: Parameters<typeof getSdkLogger>[0]) {
  const logger = getSdkLogger(category);

  const wrapLogger = (source: typeof logger): typeof logger =>
    new Proxy(source, {
      get(target, property, receiver) {
        const method = Reflect.get(target, property, receiver);
        if (typeof method !== 'function') return method;

        if (property === 'getChild' || property === 'with') {
          return (...args: unknown[]) => wrapLogger(Reflect.apply(method, target, args));
        }

        if (property !== 'error' && property !== 'warn' && property !== 'warning') {
          return method.bind(target);
        }

        return (...args: unknown[]) => {
          const [message, properties] = args;
          const details = typeof message === 'string' ? properties : message;
          if (typeof details === 'object' && details !== null) {
            const error = isUserConfigError(details)
              ? details
              : 'error' in details
                ? details.error
                : undefined;

            if (isUserConfigError(error)) {
              const infoProperties = isUserConfigError(details)
                ? { error, otel: false }
                : { ...details, otel: false };

              return typeof message === 'string'
                ? target.info(message, infoProperties)
                : target.info(infoProperties);
            }
          }

          return Reflect.apply(method, target, args);
        };
      }
    });

  return wrapLogger(logger);
}

export { disposeLogger };
