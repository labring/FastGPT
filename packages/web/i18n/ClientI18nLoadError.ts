const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

/** 客户端语言资源动态加载失败，供统一错误边界精确识别。 */
export class ClientI18nLoadError extends Error {
  readonly language: string;
  readonly namespace: string;
  readonly cause: unknown;

  constructor({
    language,
    namespace,
    cause
  }: {
    language: string;
    namespace: string;
    cause: unknown;
  }) {
    const causeMessage = getErrorMessage(cause);
    super(
      `Failed to load language resource "${language}/${namespace}"${causeMessage ? `: ${causeMessage}` : ''}`
    );
    this.name = 'ClientI18nLoadError';
    this.language = language;
    this.namespace = namespace;
    this.cause = cause;
  }
}

/** 兼容跨 bundle 的错误实例识别。 */
export const isClientI18nLoadError = (error: unknown): error is ClientI18nLoadError =>
  error instanceof ClientI18nLoadError ||
  (error instanceof Error && error.name === 'ClientI18nLoadError');
