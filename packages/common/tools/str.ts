import crypto from 'crypto';

export function strIsLink(str?: string) {
  if (!str) return false;
  if (/^((http|https)?:\/\/|www\.|\/)[^\s/$.?#].[^\s]*$/i.test(str)) return true;
  return false;
}

export const hashStr = (psw: string) => {
  return crypto.createHash('sha256').update(psw).digest('hex');
};

/* simple text, remove chinese space and extra \n */
export const simpleText = (text: string) => {
  text = text.replace(/([\u4e00-\u9fa5])[\s&&[^\n]]+([\u4e00-\u9fa5])/g, '$1$2');
  text = text.replace(/\n{2,}/g, '\n');
  text = text.replace(/[\s&&[^\n]]{2,}/g, ' ');
  text = text.replace(/[\x00-\x08]/g, ' ');

  // replace empty \n
  let newText = '';
  let lastChar = '';
  for (let i = 0; i < text.length; i++) {
    const currentChar = text[i];
    if (currentChar === '\n' && !/[。？！；.?!;]/g.test(lastChar)) {
    } else {
      newText += currentChar;
    }
    lastChar = currentChar;
  }
  return newText;
};
