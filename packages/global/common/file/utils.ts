import path from 'path';

export const isCSVFile = (filename: string) => {
  const extension = path.extname(filename).toLowerCase();
  return extension === '.csv';
};

/**
 * 判断是否为 Office/Windows 打开文档时生成的 `~$filename.ext` 锁文件。
 * 这些文件不是可解析文档，按正式后缀上传会触发 MIME 不匹配。
 */
export const isOfficeLockFilename = (filename = '') => {
  const base = filename.split(/[/\\]/).pop()?.trim() ?? '';
  return base.startsWith('~$');
};

export function detectImageContentType(buffer: Buffer) {
  if (!buffer || buffer.length < 12) return 'text/plain';

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSig.every((v, i) => buffer.readUInt8(i) === v)) return 'image/png';

  // GIF
  const gifSig = buffer.subarray(0, 6).toString('ascii');
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') return 'image/gif';

  // WEBP
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';

  return 'text/plain';
}
