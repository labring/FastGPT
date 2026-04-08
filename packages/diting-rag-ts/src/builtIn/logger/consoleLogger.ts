// src/builtIn/logger/consoleLogger.ts

import type { Logger, LoggerOptions } from '../../ports/logger';
import { LogLevel } from '../../ports/logger';

export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private prefix: string;
  private timestampFormat: 'iso' | 'unix' | 'none';

  constructor(options: LoggerOptions) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? 'diting';
    this.timestampFormat = options.timestampFormat ?? 'iso';
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(level)) return;

    const levelName = this.formatLevel(level);
    const timestamp = this.formatTimestamp();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';

    console.log(`${levelName} ${timestamp} [${this.prefix}] ${message}${metaStr}`);
  }

  private formatLevel(level: LogLevel): string {
    const names: Record<number, string> = {
      [LogLevel.DEBUG]: 'Debug',
      [LogLevel.INFO]: ' Info',
      [LogLevel.WARN]: ' Warn',
      [LogLevel.ERROR]: 'Error'
    };
    return `[${names[level] ?? ' Info'}]`;
  }

  private formatTimestamp(): string {
    if (this.timestampFormat === 'none') return '';
    if (this.timestampFormat === 'unix') return String(Math.floor(Date.now() / 1000));
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.level;
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({
      level: this.level,
      prefix: `${this.prefix}:${JSON.stringify(bindings)}`,
      timestampFormat: this.timestampFormat
    });
  }
}
