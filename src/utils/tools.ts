import crypto from 'crypto';
import { useToast } from '@/hooks/useToast';

/**
 * copy text data
 */
export const useCopyData = () => {
  const { toast } = useToast();
  return {
    copyData: (data: string, title: string = '复制成功') => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = data;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast({
          title,
          status: 'success',
          duration: 1000
        });
      } catch (error) {
        console.log(error);
        toast({
          title: '复制失败',
          status: 'error'
        });
      }
    }
  };
};

export const createHashPassword = (text: string) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return hash;
};

/**
 * 读取文件内容
 */
export const loadLocalFileContent = (file: File) => {
  return new Promise((resolve: (_: string) => void, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      reject(err);
    };
    reader.readAsText(file);
  });
};
