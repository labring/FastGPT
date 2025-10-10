/**
 * FastGPT认证系统集成模块
 * 用于处理分享链接的认证跳转
 */

// 认证代理服务器的地址
const AUTH_PROXY_URL = 'http://10.14.53.120:3004';
const AUTH_SERVICE_URL = 'http://10.14.53.120:3003';

// 检查用户是否已登录，如果未登录则跳转到登录页面
export const checkAuthAndRedirect = (shareId) => {
  // 如果在浏览器环境下执行
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fastgpt-auth-token');
    
    if (!token) {
      // 构建跳转URL
      const currentUrl = window.location.href;
      const redirectUrl = `${AUTH_SERVICE_URL}/login.html?redirect=${encodeURIComponent(currentUrl)}`;
      
      // 跳转到登录页面
      console.log('未检测到登录凭证，跳转到登录页面');
      window.location.href = redirectUrl;
      return false;
    }
    
    // 将token存储到localStorage中，以便代理服务器可以使用
    localStorage.setItem('fastgpt-auth-token', token);
    
    // 如果有token，则通过认证代理访问分享内容
    const proxyUrl = `${AUTH_PROXY_URL}/chat/share?shareId=${shareId}&token=${token}`;
    return true;
  }
  
  return true;
};

// 记录聊天内容到监控系统
export const logChatToAuthSystem = async (question, answer) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fastgpt-auth-token');
    if (!token) return;
    
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/chat/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          question,
          answer
        })
      });
      
      const data = await response.json();
      console.log('聊天记录已保存到监控系统', data);
    } catch (error) {
      console.error('保存聊天记录失败', error);
    }
  }
};

export default {
  checkAuthAndRedirect,
  logChatToAuthSystem
};