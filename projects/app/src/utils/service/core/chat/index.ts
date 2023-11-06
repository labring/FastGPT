import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api.d';

export function selectShareResponse({ responseData }: { responseData: ChatHistoryItemResType[] }) {
  const filedList = [
    'moduleType',
    'moduleName',
    'moduleLogo',
    'runningTime',
    'quoteList',
    'question'
  ];
  return responseData.map((item) => {
    const obj: Record<string, any> = {};
    for (let key in item) {
      if (filedList.includes(key)) {
        // @ts-ignore
        obj[key] = item[key];
      }
    }
    return obj;
  });
}
