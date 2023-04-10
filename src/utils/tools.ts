import crypto from 'crypto';
import { useToast } from '@/hooks/useToast';

/**
 * copy text data
 */
export const useCopyData = () => {
  const { toast } = useToast();

  return {
    copyData: async (data: string, title: string = '复制成功') => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data);
        } else {
          throw new Error('');
        }
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = data;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      toast({
        title,
        status: 'success',
        duration: 1000
      });
    }
  };
};

/**
 * 密码加密
 */
export const createHashPassword = (text: string) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return hash;
};

/**
 * 对象转成 query 字符串
 */
export const Obj2Query = (obj: Record<string, string | number>) => {
  const queryParams = new URLSearchParams();
  for (const key in obj) {
    queryParams.append(key, `${obj[key]}`);
  }
  return queryParams.toString();
};

/**
 * 向量转成 float32 buffer 格式
 */
export const vectorToBuffer = (vector: number[]) => {
  const npVector = new Float32Array(vector);

  const buffer = Buffer.from(npVector.buffer);

  return buffer;
};

export const formatVector = (vector: number[]) => {
  let formattedVector = vector.slice(0, 1536); // 截取前1536个元素
  if (vector.length > 1536) {
    formattedVector = formattedVector.concat(Array(1536 - formattedVector.length).fill(0)); // 在后面添加0
  }

  return formattedVector;
};
