import { strIsLink } from './str';

export const fileImgs = [
  { suffix: 'pdf', src: '/imgs/files/pdf.svg' },
  { suffix: 'csv', src: '/imgs/files/csv.svg' },
  { suffix: '(doc|docs)', src: '/imgs/files/doc.svg' },
  { suffix: 'txt', src: '/imgs/files/txt.svg' },
  { suffix: 'md', src: '/imgs/files/markdown.svg' },
  { suffix: '.', src: '/imgs/files/file.svg' }
];

export function getFileIcon(name = '') {
  return fileImgs.find((item) => new RegExp(item.suffix, 'gi').test(name))?.src;
}
export function getSpecialFileIcon(name = '') {
  if (name === 'manual') {
    return '/imgs/files/manual.svg';
  } else if (name === 'mark') {
    return '/imgs/files/mark.svg';
  } else if (strIsLink(name)) {
    return '/imgs/files/link.svg';
  }
}
