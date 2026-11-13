/** Bounded, append-only UTF-8 text buffer retaining only the tail up to `maxBytes`. */
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
