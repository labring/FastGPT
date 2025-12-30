import React, { useEffect, useState } from 'react';
import UserLoginPage from './pages/UserLoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboard from './pages/AdminDashboard';

type PageType = 'userLogin' | 'adminLogin' | 'adminDashboard';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('userLogin');

  useEffect(() => {
    // 检查当前路径和登录状态
    const path = window.location.pathname;
    const adminToken = localStorage.getItem('admin-token');
    const adminUser = JSON.parse(localStorage.getItem('admin-user') || '{}');

    if (path === '/admin/login') {
      setCurrentPage('adminLogin');
    } else if (path === '/admin' && adminToken && adminUser.role === 'admin') {
      setCurrentPage('adminDashboard');
    } else if (path === '/admin' && (!adminToken || adminUser.role !== 'admin')) {
      // 如果试图访问管理页但未登录或不是管理员，跳转到管理员登录页
      window.history.pushState({}, '', '/admin/login');
      setCurrentPage('adminLogin');
    } else {
      // 默认显示用户登录页
      setCurrentPage('userLogin');
    }

    // 监听浏览器前进后退
    const handlePopState = () => {
      const newPath = window.location.pathname;
      if (newPath === '/admin/login') {
        setCurrentPage('adminLogin');
      } else if (newPath === '/admin' && adminToken && adminUser.role === 'admin') {
        setCurrentPage('adminDashboard');
      } else {
        setCurrentPage('userLogin');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 全局样式覆盖
  useEffect(() => {
    // 重置body样式
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'userLogin':
        return <UserLoginPage onNavigateToAdmin={() => setCurrentPage('adminLogin')} />;
      case 'adminLogin':
        return <AdminLoginPage 
          onNavigateToUser={() => setCurrentPage('userLogin')}
          onLoginSuccess={() => setCurrentPage('adminDashboard')}
        />;
      case 'adminDashboard':
        return <AdminDashboard onLogout={() => setCurrentPage('adminLogin')} />;
      default:
        return <UserLoginPage onNavigateToAdmin={() => setCurrentPage('adminLogin')} />;
    }
  };

  return <div>{renderPage()}</div>;
};

export default App;