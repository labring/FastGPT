/* 
    replace {{variable}} to value
*/
export function replaceVariable(text: string, obj: Record<string, string>) {
  for (const key in obj) {
    const val = obj[key];
    if (typeof val !== 'string') continue;

    text = text.replace(new RegExp(`{{(${key})}}`, 'g'), val);
  }
  return text || '';
}
