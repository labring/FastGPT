import React, { useState, useEffect } from 'react';
import config from '../config';
import AnnouncementModal from '../components/AnnouncementModal';
import './UserLoginPage.css';

interface UserLoginPageProps {
  onNavigateToAdmin?: () => void;
}

const UserLoginPage: React.FC<UserLoginPageProps> = ({ onNavigateToAdmin }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);
  
  // 忘记密码相关状态
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1); // 1: 输入邮箱, 2: 输入验证码和新密码
  const [forgotPasswordData, setForgotPasswordData] = useState({
    email: '',
    verificationCode: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [generatedCode, setGeneratedCode] = useState('');

  // 获取重定向URL参数
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    if (redirect) {
      setRedirectUrl(redirect);
      console.log('检测到重定向URL:', redirect);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.username || !formData.password) {
      setError('请填写用户名和密码');
      return false;
    }

    if (!isLoginMode) {
      if (!formData.email) {
        setError('请填写邮箱地址');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('两次输入的密码不一致');
        return false;
      }
      if (formData.password.length < 6) {
        setError('密码长度至少6位');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      // 调用 Spring Boot 后端 API
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const requestData = isLoginMode 
        ? { username: formData.username, password: formData.password }
        : { 
            username: formData.username, 
            email: formData.email, 
            password: formData.password 
          };

      const response = await fetch(`${config.AUTH_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      
      const data = await response.json();
      
      if (data.code === 1) {
        if (isLoginMode) {
          // 登录成功
          localStorage.setItem('user-token', data.data.token);
          localStorage.setItem('user-info', JSON.stringify(data.data));
          
          // 设置cookie（用于代理服务器验证）
          document.cookie = `auth_token=${data.data.token}; path=/; max-age=86400; SameSite=Lax`;
          
          // 同时设置带域名的cookie，用于跨域访问
          document.cookie = `auth_token=${data.data.token}; domain=10.14.53.120; path=/; max-age=86400; SameSite=Lax`;
          
          // 保存用户ID并检查是否有未读公告
          const userId = data.data.userId || data.data.id;
          setLoggedInUserId(userId);
          
          // 先显示公告（如果有），公告关闭后再跳转
          setShowAnnouncements(true);
        } else {
          // 注册成功，切换到登录模式
          setIsLoginMode(true);
          setFormData(prev => ({ ...prev, email: '', confirmPassword: '' }));
          setError('');
          // 可以显示成功提示
          alert('注册成功！请使用用户名和密码登录。');
        }
      } else {
        setError(data.msg || (isLoginMode ? '登录失败' : '注册失败'));
      }
    } catch (error) {
      console.error('请求失败:', error);
      setError('网络请求失败，请检查服务器是否运行');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // 生成6位随机验证码
  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // 发送验证码
  const handleSendVerificationCode = async () => {
    if (!forgotPasswordData.email) {
      setError('请输入邮箱地址');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const code = generateVerificationCode();
      setGeneratedCode(code);

      // 调用后端发送验证码API
      const response = await fetch(`${config.AUTH_API_URL}/auth/send-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          code: code
        })
      });

      const data = await response.json();

      if (data.code === 1) {
        setForgotPasswordStep(2);
        alert(`验证码已发送到邮箱：${forgotPasswordData.email}\n请查收邮件获取验证码`);
      } else {
        // 如果邮件发送失败（如：邮件服务未配置），使用开发模式
        if (data.msg && data.msg.includes('邮件发送失败')) {
          console.warn('邮件服务未配置，使用开发模式');
          setForgotPasswordStep(2);
          alert(`⚠️ 邮件服务未配置\n\n开发模式：验证码为 ${code}\n\n提示：请在后端配置邮件服务以发送真实邮件\n详见：邮件配置-快速开始.md`);
        } else {
          setError(data.msg || '发送验证码失败，请检查邮箱是否正确');
        }
      }
    } catch (error) {
      console.error('发送验证码失败:', error);
      // 如果后端接口不存在或网络错误，使用模拟模式
      const code = generateVerificationCode();
      setGeneratedCode(code);
      setForgotPasswordStep(2);
      alert(`验证码已生成（开发模式）：${code}\n请输入此验证码继续`);
    } finally {
      setLoading(false);
    }
  };

  // 重置密码
  const handleResetPassword = async () => {
    if (!forgotPasswordData.verificationCode) {
      setError('请输入验证码');
      return;
    }
    if (forgotPasswordData.verificationCode !== generatedCode) {
      setError('验证码错误');
      return;
    }
    if (!forgotPasswordData.newPassword || forgotPasswordData.newPassword.length < 6) {
      setError('新密码至少6位');
      return;
    }
    if (forgotPasswordData.newPassword !== forgotPasswordData.confirmNewPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${config.AUTH_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          newPassword: forgotPasswordData.newPassword
        })
      });

      const data = await response.json();

      if (data.code === 1) {
        alert('密码重置成功！请使用新密码登录');
        setShowForgotPassword(false);
        setForgotPasswordStep(1);
        setForgotPasswordData({
          email: '',
          verificationCode: '',
          newPassword: '',
          confirmNewPassword: ''
        });
        setGeneratedCode('');
      } else {
        setError(data.msg || '密码重置失败');
      }
    } catch (error) {
      console.error('密码重置失败:', error);
      setError('网络请求失败，请检查服务器是否运行');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForgotPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 公告关闭后的跳转逻辑
  const handleAnnouncementClose = () => {
    setShowAnnouncements(false);
    
    // 跳转到原来的分享页面
    if (redirectUrl) {
      console.log('跳转到原始页面:', redirectUrl);
      const url = new URL(redirectUrl);
      const token = localStorage.getItem('user-token');
      if (token && !url.searchParams.has('token')) {
        url.searchParams.set('token', token);
      }
      window.location.href = url.toString();
    } else {
      // 如果没有重定向URL，跳转到默认页面
      window.location.href = config.FASTGPT_URL;
    }
  };

  return (
    <div className="user-login-body">
      {/* 公告弹窗 */}
      {showAnnouncements && loggedInUserId && (
        <AnnouncementModal 
          userId={loggedInUserId} 
          onClose={handleAnnouncementClose}
        />
      )}
      
      <div className="user-login-container">
        <div className="logo-section">
          <h1>FastGPT 认证系统</h1>
          <p>{isLoginMode ? '用户登录' : '用户注册'}</p>
        </div>
        
        <div className="mode-toggle">
          <button 
            className={isLoginMode ? 'active' : ''}
            onClick={() => {
              setIsLoginMode(true);
              setError('');
              setFormData(prev => ({ ...prev, email: '', confirmPassword: '' }));
            }}
          >
            登录
          </button>
          <button 
            className={!isLoginMode ? 'active' : ''}
            onClick={() => {
              setIsLoginMode(false);
              setError('');
            }}
          >
            注册
          </button>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="form-section">
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入用户名"
              disabled={loading}
            />
          </div>
          
          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="email">邮箱</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="请输入邮箱地址"
                disabled={loading}
              />
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={isLoginMode ? "请输入密码" : "请输入密码（至少6位）"}
              disabled={loading}
            />
          </div>
          
          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="confirmPassword">确认密码</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="请再次输入密码"
                disabled={loading}
              />
            </div>
          )}
          
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (isLoginMode ? '登录中...' : '注册中...') : (isLoginMode ? '登录' : '注册')}
          </button>
          
          {isLoginMode && (
            <button 
              className="link-btn"
              onClick={() => {
                setShowForgotPassword(true);
                setError('');
              }}
              style={{ marginTop: '10px', width: '100%' }}
            >
              忘记密码？
            </button>
          )}
        </div>
        
        <div className="footer-links">
          <button 
            className="link-btn"
            onClick={onNavigateToAdmin}
          >
            管理员入口
          </button>
        </div>
        
        {/* 忘记密码模态框 */}
        {showForgotPassword && (
          <div className="modal-overlay" onClick={() => {
            setShowForgotPassword(false);
            setForgotPasswordStep(1);
            setForgotPasswordData({
              email: '',
              verificationCode: '',
              newPassword: '',
              confirmNewPassword: ''
            });
            setGeneratedCode('');
            setError('');
          }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>忘记密码</h2>
              
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              
              {forgotPasswordStep === 1 && (
                <div className="form-section">
                  <div className="form-group">
                    <label htmlFor="forgot-email">邮箱地址</label>
                    <input
                      type="email"
                      id="forgot-email"
                      name="email"
                      value={forgotPasswordData.email}
                      onChange={handleForgotPasswordInputChange}
                      placeholder="请输入注册时使用的邮箱"
                      disabled={loading}
                    />
                  </div>
                  
                  <button
                    className="submit-btn"
                    onClick={handleSendVerificationCode}
                    disabled={loading}
                  >
                    {loading ? '发送中...' : '发送验证码'}
                  </button>
                </div>
              )}
              
              {forgotPasswordStep === 2 && (
                <div className="form-section">
                  <div className="form-group">
                    <label htmlFor="verification-code">验证码</label>
                    <input
                      type="text"
                      id="verification-code"
                      name="verificationCode"
                      value={forgotPasswordData.verificationCode}
                      onChange={handleForgotPasswordInputChange}
                      placeholder="请输入6位验证码"
                      maxLength={6}
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="new-password">新密码</label>
                    <input
                      type="password"
                      id="new-password"
                      name="newPassword"
                      value={forgotPasswordData.newPassword}
                      onChange={handleForgotPasswordInputChange}
                      placeholder="请输入新密码（至少6位）"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="confirm-new-password">确认新密码</label>
                    <input
                      type="password"
                      id="confirm-new-password"
                      name="confirmNewPassword"
                      value={forgotPasswordData.confirmNewPassword}
                      onChange={handleForgotPasswordInputChange}
                      placeholder="请再次输入新密码"
                      disabled={loading}
                    />
                  </div>
                  
                  <button
                    className="submit-btn"
                    onClick={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? '重置中...' : '重置密码'}
                  </button>
                  
                  <button
                    className="link-btn"
                    onClick={() => {
                      setForgotPasswordStep(1);
                      setForgotPasswordData(prev => ({
                        ...prev,
                        verificationCode: '',
                        newPassword: '',
                        confirmNewPassword: ''
                      }));
                      setError('');
                    }}
                    style={{ marginTop: '10px', width: '100%' }}
                  >
                    重新发送验证码
                  </button>
                </div>
              )}
              
              <button
                className="link-btn"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordStep(1);
                  setForgotPasswordData({
                    email: '',
                    verificationCode: '',
                    newPassword: '',
                    confirmNewPassword: ''
                  });
                  setGeneratedCode('');
                  setError('');
                }}
                style={{ marginTop: '10px', width: '100%' }}
              >
                取消
              </button>
            </div>
          </div>
        )}
        
        <div className="footer">
          <p>© FastGPT 认证系统. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default UserLoginPage;