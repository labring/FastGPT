import { readPdfFile } from './pdf';
import { readDocFle } from './word';
import { ReadFileBufferItemType, ReadFileParams } from './type';

global.readFileBuffers = global.readFileBuffers || [];

const bufferMaxSize = 200;

export const pushFileReadBuffer = (params: ReadFileBufferItemType) => {
  global.readFileBuffers.push(params);

  if (global.readFileBuffers.length > bufferMaxSize) {
    global.readFileBuffers.shift();
  }
};
export const getReadFileBuffer = ({ path, teamId }: ReadFileParams) =>
  global.readFileBuffers.find((item) => item.path === path && item.teamId === teamId);

export const readFileContent = async (params: ReadFileParams) => {
  const { path } = params;

  const buffer = getReadFileBuffer(params);

  if (buffer) {
    return buffer;
  }

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const { rawText } = await (async () => {
    switch (extension) {
      case 'pdf':
        return readPdfFile(params);
      case 'docx':
        return readDocFle(params);
      default:
        return Promise.reject('Only support .pdf, .docx');
    }
  })();

  pushFileReadBuffer({
    ...params,
    rawText
  });

  return {
    ...params,
    rawText
  };
};
