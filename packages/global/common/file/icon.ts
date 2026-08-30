const fileIconByExtension = {
  pdf: 'file/fill/pdf',

  ppt: 'file/fill/ppt',
  pptx: 'file/fill/ppt',
  pps: 'file/fill/ppt',
  pot: 'file/fill/ppt',
  pptm: 'file/fill/ppt',
  ppsx: 'file/fill/ppt',
  ppsm: 'file/fill/ppt',
  odp: 'file/fill/ppt',

  xls: 'file/fill/xlsx',
  xlsx: 'file/fill/xlsx',
  xlsm: 'file/fill/xlsx',
  xlsb: 'file/fill/xlsx',
  ods: 'file/fill/xlsx',
  csv: 'file/fill/csv',

  doc: 'file/fill/doc',
  docx: 'file/fill/doc',
  docs: 'file/fill/doc',
  docm: 'file/fill/doc',
  wps: 'file/fill/doc',
  odt: 'file/fill/doc',
  rtf: 'file/fill/doc',

  txt: 'file/fill/txt',
  md: 'file/fill/markdown',
  markdown: 'file/fill/markdown',
  html: 'file/fill/html',
  htm: 'file/fill/html',
  epub: 'file/fill/epub',

  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  bmp: 'image',
  webp: 'image',
  svg: 'image',
  ico: 'image',
  tiff: 'image',
  tif: 'image',

  mp3: 'file/fill/audio',
  wav: 'file/fill/audio',
  ogg: 'file/fill/audio',
  m4a: 'file/fill/audio',
  amr: 'file/fill/audio',
  mpga: 'file/fill/audio',

  mp4: 'file/fill/video',
  mov: 'file/fill/video',
  avi: 'file/fill/video',
  mpeg: 'file/fill/video',
  webm: 'file/fill/video'
} as const;

const getFileExtension = (name: string) => {
  const pathWithoutQuery = name.split(/[?#]/, 1)[0] ?? '';
  const pathParts = pathWithoutQuery.split(/[/\\]/);
  const encodedFilename = pathParts[pathParts.length - 1]?.trim() ?? '';
  const filename = (() => {
    try {
      return decodeURIComponent(encodedFilename);
    } catch {
      return encodedFilename;
    }
  })();
  const dotIndex = filename.lastIndexOf('.');

  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
};

/**
 * 根据文件名最后一个扩展名选择图标。
 *
 * 只读取 URL pathname，避免查询参数或文件名正文中的 `.doc` 等片段抢先命中错误图标。
 */
export const getFileIcon = (name = '', defaultImg = 'file/fill/file') => {
  const extension = getFileExtension(name);
  return fileIconByExtension[extension as keyof typeof fileIconByExtension] ?? defaultImg;
};
