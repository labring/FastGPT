/**
 * read file raw text
 */
export const readFileRawText = (file: File) => {
  return new Promise<{ rawText: string }>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          rawText: reader.result as string
        });
      };
      reader.onerror = (err) => {
        console.log('error txt read:', err);
        reject('Read file error');
      };
      reader.readAsText(file);
    } catch (error) {
      reject(error);
    }
  });
};
