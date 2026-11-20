import type { WriteEntry } from '@alibaba-group/opensandbox';
import type { ImageSpec } from './type';

/** 保留尾部数据的有界 UTF-8 输出缓冲区，防止海量命令输出打爆宿主内存。 */
export class BoundedOutputBuffer {
  private chunks: Buffer[] = [];
  private currentBytes = 0;
  private _truncated = false;
  private readonly separatorBuf?: Buffer;

  constructor(
    private readonly maxBytes: number,
    separator?: string
  ) {
    if (!(maxBytes > 0)) {
      throw new Error(`BoundedOutputBuffer: maxBytes must be > 0 (got ${maxBytes})`);
    }
    if (separator) this.separatorBuf = Buffer.from(separator, 'utf8');
  }

  append(text: string): void {
    if (!text) return;

    const needsSep = this.separatorBuf && this.chunks.length > 0;
    const textBuf = Buffer.from(text, 'utf8');
    const sepLen = needsSep ? this.separatorBuf!.length : 0;

    if (textBuf.length + sepLen > this.maxBytes) {
      this._truncated = true;
      const keep = Math.min(textBuf.length, this.maxBytes);
      this.chunks = [
        keep < textBuf.length ? Buffer.from(textBuf.subarray(textBuf.length - keep)) : textBuf
      ];
      this.currentBytes = keep;
      return;
    }

    const chunk = needsSep ? Buffer.concat([this.separatorBuf!, textBuf]) : textBuf;
    this.chunks.push(chunk);
    this.currentBytes += chunk.length;
    if (this.currentBytes <= this.maxBytes) return;

    this._truncated = true;
    while (this.chunks.length > 1 && this.currentBytes - this.chunks[0].length >= this.maxBytes) {
      this.currentBytes -= this.chunks[0].length;
      this.chunks.shift();
    }
    if (this.currentBytes > this.maxBytes && this.chunks.length > 0) {
      const overflow = this.currentBytes - this.maxBytes;
      this.chunks[0] = this.chunks[0].subarray(overflow);
      this.currentBytes -= overflow;
    }
    if (this.separatorBuf && this.chunks.length > 0) {
      const first = this.chunks[0];
      if (first.subarray(0, this.separatorBuf.length).equals(this.separatorBuf)) {
        this.chunks[0] = first.subarray(this.separatorBuf.length);
        this.currentBytes -= this.separatorBuf.length;
      }
    }
  }

  get truncated(): boolean {
    return this._truncated;
  }

  toString(): string {
    return this.chunks.length === 0
      ? ''
      : Buffer.concat(this.chunks, this.currentBytes).toString('utf8');
  }
}

/** 将 ImageSpec 格式化为标准容器镜像字符串。 */
export function formatImageSpec(image: ImageSpec): string {
  const parts: string[] = [image.repository];
  if (image.tag) parts.push(':', image.tag);
  if (image.digest) parts.push('@', image.digest);
  return parts.join('');
}

/** 解析镜像字符串为 `{ repository, tag, digest }`，正确识别含端口号的 registry 地址与 `@digest`。 */
export function parseImageSpec(image?: string): ImageSpec {
  if (!image) return { repository: '' };

  const atIndex = image.indexOf('@');
  const nameAndTag = atIndex > -1 ? image.slice(0, atIndex) : image;
  const digest = atIndex > -1 ? image.slice(atIndex + 1) : undefined;

  const slashIndex = nameAndTag.lastIndexOf('/');
  const colonIndex = nameAndTag.lastIndexOf(':');
  if (colonIndex > slashIndex) {
    return {
      repository: nameAndTag.slice(0, colonIndex),
      tag: nameAndTag.slice(colonIndex + 1),
      ...(digest ? { digest } : {})
    };
  }

  return {
    repository: nameAndTag,
    ...(digest ? { digest } : {})
  };
}

/** 结构化判断写入载荷是否为 ReadableStream。 */
export function isReadableStreamData(data: unknown): data is ReadableStream<Uint8Array> {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as ReadableStream<Uint8Array>).getReader === 'function'
  );
}

/** 计算非流式文件写入载荷的字节长度。 */
export function getFileDataByteLength(data: WriteEntry['data']): number {
  if (typeof data === 'string') {
    return Buffer.byteLength(data, 'utf8');
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  return 0;
}

/** 将 POSIX bitmask 权限（`0o644`）转换为 OpenSandbox API 期望的十进制八进制数字（`644`）。 */
export function posixModeToOctalNumber(mode: number): number {
  if (!Number.isSafeInteger(mode) || mode < 0 || mode > 0o7777) {
    throw new TypeError(`Invalid POSIX file mode: ${String(mode)}`);
  }
  return Number.parseInt(mode.toString(8), 10);
}

/** 将 OpenSandbox 返回的八进制整数（`644`）还原为 POSIX bitmask 权限（`0o644`）。 */
export function octalNumberToPosixMode(mode: number): number {
  if (!Number.isSafeInteger(mode) || mode < 0 || !/^[0-7]+$/.test(String(mode))) {
    throw new TypeError(`Invalid provider file mode: ${String(mode)}`);
  }
  return Number.parseInt(String(mode), 8);
}
