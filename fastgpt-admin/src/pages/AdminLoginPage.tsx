import React, { useState } from 'react';
import config from '../config';
import './AdminLoginPage.css';

interface AdminLoginPageProps {
  onNavigateToUser?: () => void;
  onLoginSuccess?: () => void;
}

const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ 
  onNavigateToUser, 
  onLoginSuccess 
}) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async () => {
    if (!formData.username || !formData.password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${config.AUTH_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password
        })
      });
      
      const data = await response.json();
      
      if (data.code === 1) {
        // 检查是否是管理员
        if (data.data.role === 'admin') {
          // 保存管理员token和信息
          localStorage.setItem('admin-token', data.data.token);
          localStorage.setItem('admin-user', JSON.stringify(data.data));
          
          // 跳转到管理后台
          if (onLoginSuccess) {
            onLoginSuccess();
          }
        } else {
          setError('您不是管理员，无权访问此页面');
        }
      } else {
        setError(data.msg || '用户名或密码错误');
      }
    } catch (error) {
      console.error('登录请求失败:', error);
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

  return (
    <div className="admin-login-body">
      <div className="admin-login-container">
        <div className="admin-logo-section">
          <div className="admin-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L13.09 8.26L19 7L18.74 13.74L24 15L13.74 18.74L15 24L8.26 13.74L2 15L7 7L8.26 2L12 2Z" fill="#ef4444"/>
              <path d="M12 6C8.69 6 6 8.69 6 12S8.69 18 12 18 18 15.31 18 12 15.31 6 12 6ZM12 16C9.79 16 8 14.21 8 12S9.79 8 12 8 16 9.79 16 12 14.21 16 12 16Z" fill="#ef4444"/>
            </svg>
          </div>
          <h1>管理员控制台</h1>
          <p>FastGPT 认证系统管理后台</p>
        </div>
        
        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}
        
        <div className="admin-form-section">
          <div className="admin-form-group">
            <label htmlFor="admin-username">管理员用户名</label>
            <input
              type="text"
              id="admin-username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入管理员用户名"
              disabled={loading}
            />
          </div>
          
          <div className="admin-form-group">
            <label htmlFor="admin-password">管理员密码</label>
            <input
              type="password"
              id="admin-password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入管理员密码"
              disabled={loading}
            />
          </div>
          
          <button
            className="admin-submit-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '登录中...' : '登录管理后台'}
          </button>
        </div>
        
        <div className="admin-footer-links">
          <button 
            className="admin-link-btn"
            onClick={onNavigateToUser}
          >
            ← 返回用户登录
          </button>
        </div>
        
        <div className="admin-footer">
          <p>© FastGPT 认证系统管理后台</p>
          <p className="admin-warning">仅限管理员访问</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;