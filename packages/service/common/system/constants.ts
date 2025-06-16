// 如果没有配置商业版 URL，使用普通 API URL
export const FastGPTProUrl = process.env.PRO_URL
  ? `${process.env.PRO_URL}/api`
  : process.env.API_URL || '';

// 移除商业版服务检查
export const isFastGPTProService = () => true; // 始终返回 true，允许所有功能
