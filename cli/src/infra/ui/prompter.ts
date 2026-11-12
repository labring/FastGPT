import * as clack from '@clack/prompts';
import { CliArgumentError } from '../../shared/errors';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export type Prompter = {
  readonly isInteractive: boolean;
  text: (params: {
    message: string;
    defaultValue?: string;
    placeholder?: string;
  }) => Promise<string>;
  secret: (params: { message: string }) => Promise<string>;
  confirm: (params: { message: string; initialValue?: boolean }) => Promise<boolean>;
  select: <T extends string>(params: {
    message: string;
    options: readonly SelectOption<T>[];
    initialValue?: T;
  }) => Promise<T>;
  note: (message: string, title?: string) => void;
  spinner: () => {
    start: (message: string) => void;
    stop: (message: string) => void;
  };
};

function unwrapPromptText(value: string | symbol): string {
  if (clack.isCancel(value) || typeof value === 'symbol') {
    clack.cancel('Operation cancelled.', { output: process.stderr });
    throw new CliArgumentError('Operation cancelled by user.');
  }
  return value.trim();
}

function unwrapPromptSecret(value: string | symbol): string {
  if (clack.isCancel(value) || typeof value === 'symbol') {
    clack.cancel('Operation cancelled.', { output: process.stderr });
    throw new CliArgumentError('Operation cancelled by user.');
  }
  // 仅剥离尾随换行符，保留密码中可能有意包含的首尾空格，与 --password-stdin 保持一致。
  return value.replace(/\r?\n$/, '');
}

/**
 * 基于 `@clack/prompts` 的交互式终端适配器；所有提示均输出至 stderr，保持 stdout 纯净供 JSON/管道使用。
 */
export function createClackPrompter(): Prompter {
  return {
    isInteractive: true,
    text: async ({ message, defaultValue, placeholder }) => {
      const value = await clack.text({
        message,
        defaultValue,
        placeholder,
        output: process.stderr
      });
      return unwrapPromptText(value);
    },
    secret: async ({ message }) => {
      const value = await clack.password({
        message,
        output: process.stderr
      });
      return unwrapPromptSecret(value);
    },
    confirm: async ({ message, initialValue = false }) => {
      const value = await clack.confirm({
        message,
        initialValue,
        output: process.stderr
      });
      if (clack.isCancel(value) || typeof value === 'symbol') {
        clack.cancel('Operation cancelled.', { output: process.stderr });
        throw new CliArgumentError('Operation cancelled by user.');
      }
      return Boolean(value);
    },
    select: async <T extends string>({
      message,
      options,
      initialValue
    }: {
      message: string;
      options: readonly SelectOption<T>[];
      initialValue?: T;
    }): Promise<T> => {
      const value = await clack.select<T>({
        message,
        options: options.map((item) => ({
          value: item.value,
          label: item.label,
          ...(item.hint ? { hint: item.hint } : {})
        })) as Parameters<typeof clack.select<T>>[0]['options'],
        initialValue,
        output: process.stderr
      });
      if (clack.isCancel(value) || typeof value === 'symbol') {
        clack.cancel('Operation cancelled.', { output: process.stderr });
        throw new CliArgumentError('Operation cancelled by user.');
      }
      const matched = options.find((item) => item.value === value);
      if (!matched) {
        throw new CliArgumentError(`Unexpected selection "${String(value)}".`);
      }
      return matched.value;
    },
    note: (message, title) => {
      clack.note(message, title, { output: process.stderr });
    },
    spinner: () => {
      const spin = clack.spinner({ output: process.stderr });
      return {
        start: (msg) => spin.start(msg),
        stop: (msg) => spin.stop(msg)
      };
    }
  };
}

/**
 * 非交互环境适配器：拒绝触发任何交互提示，避免脚本或 Agent 调用卡死。
 */
export function createNonTtyPrompter(reason?: string): Prompter {
  const rejectPrompt = async (): Promise<never> => {
    throw new CliArgumentError(
      reason ?? 'Interactive input is unavailable in non-TTY mode.',
      undefined,
      'Pass credentials via flags (--api-key-stdin, --token-stdin, --username --password-stdin) or environment variables.'
    );
  };

  return {
    isInteractive: false,
    text: rejectPrompt,
    secret: rejectPrompt,
    confirm: async () => false,
    select: rejectPrompt,
    note: () => {},
    spinner: () => ({
      start: () => {},
      stop: () => {}
    })
  };
}
