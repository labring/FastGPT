export const fileImgs = [
  { suffix: 'pdf', src: 'file/fill/pdf' },
  { suffix: 'csv', src: 'file/fill/csv' },
  { suffix: '(doc|docs)', src: 'file/fill/doc' },
  { suffix: 'txt', src: 'file/fill/txt' },
  { suffix: 'md', src: 'file/fill/markdown' }
  // { suffix: '.', src: '/imgs/files/file.svg' }
];

export function getFileIcon(name = '', defaultImg = '/imgs/files/file.svg') {
  return fileImgs.find((item) => new RegExp(item.suffix, 'gi').test(name))?.src || defaultImg;
}
