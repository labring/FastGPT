import { useSystemStore } from './useSystemStore';

export const downloadFetch = async ({ url, filename }: { url: string; filename: string }) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const getWebLLMModel = (model?: string) => {
  const list = useSystemStore.getState().llmModelList;
  return list.find((item) => item.model === model || item.name === model) ?? list[0];
};
