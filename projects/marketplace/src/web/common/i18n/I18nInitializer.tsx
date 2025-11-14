import { useEffect } from 'react';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';

interface I18nInitializerProps {
  onInitialized?: () => void;
}

/**
 * 初始化 i18n 语言设置
 * 根据用户浏览器语言自动设置默认语言
 */
const I18nInitializer = ({ onInitialized }: I18nInitializerProps) => {
  const { setUserDefaultLng } = useI18nLng();

  useEffect(() => {
    // 只在客户端执行语言自动判断
    if (typeof window !== 'undefined') {
      try {
        setUserDefaultLng();
      } catch (error) {
        console.warn('Failed to initialize i18n language:', error);
      }
    }

    // 调用回调函数（如果提供）
    onInitialized?.();
  }, [setUserDefaultLng, onInitialized]);

  // 这个组件不需要渲染任何内容
  return null;
};

export default I18nInitializer;
