// 认证服务返回的数据结构
export interface SkyworthAuthResponse {
  success: boolean;
  message: string;
  code: number;
  result: {
    id: string;
    username: string;
    realname: string;
    avatar: string;
    birthday: string;
  } | null;
  timestamp?: number;
}

// token 验证函数
export const validateSkyworthToken = async (token?: string): Promise<SkyworthAuthResponse> => {
  if (!token) {
    return {
      success: false,
      message: 'Token is required',
      code: 401,
      result: null
    };
  }

  try {
    // 根据环境使用不同的认证服务地址
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://ai-kb.skyworthdigital.com'
        : 'http://172.28.17.114';

    const response = await fetch(
      `${baseUrl}/api/ky/sys/validate-token?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('Skyworth token validation error:', error);
    return {
      success: false,
      message: error.message || 'Token validation failed',
      code: 500,
      result: null
    };
  }
};
