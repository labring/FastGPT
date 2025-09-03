import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ConnectionTestResult {
  success: boolean;
  message?: string;
}

export const useConnectionTest = () => {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [connectionSuccess, setConnectionSuccess] = useState(false);

  const testConnection = async (connectionData: any): Promise<ConnectionTestResult> => {
    setIsConnecting(true);
    setConnectionError('');
    setConnectionSuccess(false);

    try {
      // 使用Promise和setTimeout模拟各种连接场景
      return await new Promise<ConnectionTestResult>((resolve) => {
        setTimeout(() => {
          // 模拟成功场景 (50%概率)
          // if (Math.random() > 0.5) {
          //   setConnectionSuccess(true);
          //   resolve({ success: true });
          // }
          // // 模拟配置错误场景 (30%概率)
          // else if (Math.random() > 0.3) {
          //   const errorMessage = t('连接失败，请检查配置信息');
          //   setConnectionError(errorMessage);
          //   resolve({ success: false, message: errorMessage });
          // }
          // // 模拟网络错误场景 (20%概率)
          // else {
          //   const errorMessage = t('连接失败，请检查网络连接');
          //   setConnectionError(errorMessage);
          //   resolve({ success: false, message: errorMessage });
          // }
          const errorMessage = t('dataset:connection_network_error');
          setConnectionError(errorMessage);
          resolve({ success: false, message: errorMessage });
        }, 1500); // 模拟1.5秒的网络延迟
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const resetConnectionState = useCallback(() => {
    setConnectionError('');
    setConnectionSuccess(false);
    setIsConnecting(false);
  }, []);

  return {
    isConnecting,
    connectionError,
    connectionSuccess,
    testConnection,
    resetConnectionState
  };
};
