import crypto from 'crypto';
import { useToast } from '@/hooks/useToast';
import dayjs from 'dayjs';

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
 * 格式化时间成聊天格式
 */
export const formatTimeToChatTime = (time: Date) => {
  const now = dayjs();
  const target = dayjs(time);

  // 如果传入时间小于60秒，返回刚刚
  if (now.diff(target, 'second') < 60) {
    return '刚刚';
  }

  // 如果时间是今天，展示几时:几秒
  if (now.isSame(target, 'day')) {
    return target.format('HH:mm');
  }

  // 如果是昨天，展示昨天
  if (now.subtract(1, 'day').isSame(target, 'day')) {
    return '昨天';
  }

  // 如果是前天，展示前天
  if (now.subtract(2, 'day').isSame(target, 'day')) {
    return '前天';
  }

  // 如果是今年，展示某月某日
  if (now.isSame(target, 'year')) {
    return target.format('M月D日');
  }

  // 如果是更久之前，展示某年某月某日
  return target.format('YYYY/M/D');
};

export const hasVoiceApi = typeof window !== 'undefined' && 'speechSynthesis' in window;
/**
 * voice broadcast
 */
export const voiceBroadcast = ({ text }: { text: string }) => {
  window.speechSynthesis?.cancel();
  const msg = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis?.getVoices?.(); // 获取语言包
  const voice = voices.find((item) => {
    return item.name === 'Microsoft Yaoyao - Chinese (Simplified, PRC)';
  });
  if (voice) {
    msg.voice = voice;
  }

  window.speechSynthesis?.speak(msg);

  msg.onerror = (e) => {
    console.log(e);
  };

  return {
    cancel: () => window.speechSynthesis?.cancel()
  };
};

export const getErrText = (err: any, def = '') => {
  const msg: string = typeof err === 'string' ? err : err?.message || def || '';
  msg && console.log('error =>', msg);
  return msg;
};

export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });
