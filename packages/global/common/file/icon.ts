export const fileImgs = [
  { suffix: 'pdf', src: 'file/fill/pdf' },
  { suffix: 'ppt', src: 'file/fill/ppt' },
  { suffix: 'xlsx', src: 'file/fill/xlsx' },
  { suffix: 'csv', src: 'file/fill/csv' },
  { suffix: '(doc|docs)', src: 'file/fill/doc' },
  { suffix: 'txt', src: 'file/fill/txt' },
  { suffix: 'md', src: 'file/fill/markdown' },
  { suffix: 'html', src: 'file/fill/html' },
  { suffix: '(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif)', src: 'image' }

  // { suffix: '.', src: '/imgs/files/file.svg' }
];

export function getFileIcon(name = '', defaultImg = 'file/fill/file') {
  return (
    fileImgs.find((item) => new RegExp(`\.${item.suffix}`, 'gi').test(name))?.src || defaultImg
  );
}
