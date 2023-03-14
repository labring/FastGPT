interface StreamFetchProps {
  url: string;
  data: any;
  onMessage: (text: string) => void;
}
export const streamFetch = ({ url, data, onMessage }: StreamFetchProps) =>
  new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let responseText = '';

      const read = async () => {
        const { done, value } = await reader?.read();
        if (done) {
          if (res.status === 200) {
            resolve(responseText);
          } else {
            try {
              const parseError = JSON.parse(responseText);
              reject(parseError?.message || '请求异常');
            } catch (err) {
              reject('请求异常');
            }
          }

          return;
        }
        const text = decoder.decode(value).replace(/<br\/>/g, '\n');
        res.status === 200 && onMessage(text);
        responseText += text;
        read();
      };
      read();
    } catch (err: any) {
      console.log(err, '====');
      reject(typeof err === 'string' ? err : err?.message || '请求异常');
    }
  });
