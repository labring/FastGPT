import { useSystemStore } from './useSystemStore';

export const downloadFetch = async ({
  url,
  filename,
  body
}: {
  url: string;
  filename: string;
  body?: Record<string, any>;
}) => {
  if (body) {
    // fetch data with POST method if body exists
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // clean up the blob URL
    window.URL.revokeObjectURL(downloadUrl);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

export const getWebLLMModel = (model?: string) => {
  const list = useSystemStore.getState().llmModelList;
  return list.find((item) => item.model === model || item.name === model) ?? list[0];
};
