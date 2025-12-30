import React, { useEffect, useState } from 'react';
import './AdminDashboard.css';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt?: string;
}

interface ChatLog {
  id: string;
  username: string;
  email: string;
  question: string;
  answer: string;
  timestamp: string;
  category?: string; // 添加分类字段
}

// 预定义的分类选项
const CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: '计算机', label: '计算机' },
  { value: '医疗', label: '医疗' },
  { value: '教育', label: '教育' },
  { value: '商业', label: '商业' },
  { value: '科学', label: '科学' },
  { value: '生活', label: '生活' },
  { value: '娱乐', label: '娱乐' },
  { value: '其他', label: '其他' }
];

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [filteredChatLogs, setFilteredChatLogs] = useState<ChatLog[]>([]); // 过滤后的对话记录
  const [activeTab, setActiveTab] = useState<'users' | 'chats' | 'settings'>('chats'); // 默认显示chats标签页
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(''); // 选中的分类
  const [isExporting, setIsExporting] = useState(false); // 导出状态

  // 获取 token
  const token = localStorage.getItem('admin-token') || '';

  // 根据问题内容自动分类的函数
  const categorizeQuestion = (question: string): string => {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('编程') || lowerQuestion.includes('代码') || 
        lowerQuestion.includes('算法') || lowerQuestion.includes('软件') ||
        lowerQuestion.includes('计算机') || lowerQuestion.includes('网络') ||
        lowerQuestion.includes('数据库') || lowerQuestion.includes('开发')) {
      return '计算机';
    }
    
    if (lowerQuestion.includes('医疗') || lowerQuestion.includes('健康') || 
        lowerQuestion.includes('病') || lowerQuestion.includes('药') ||
        lowerQuestion.includes('症状') || lowerQuestion.includes('治疗')) {
      return '医疗';
    }
    
    if (lowerQuestion.includes('教育') || lowerQuestion.includes('学习') || 
        lowerQuestion.includes('课程') || lowerQuestion.includes('考试') ||
        lowerQuestion.includes('学校') || lowerQuestion.includes('知识')) {
      return '教育';
    }
    
    if (lowerQuestion.includes('商业') || lowerQuestion.includes('营销') || 
        lowerQuestion.includes('投资') || lowerQuestion.includes('创业') ||
        lowerQuestion.includes('经济') || lowerQuestion.includes('管理')) {
      return '商业';
    }
    
    if (lowerQuestion.includes('科学') || lowerQuestion.includes('研究') || 
        lowerQuestion.includes('实验') || lowerQuestion.includes('理论') ||
        lowerQuestion.includes('物理') || lowerQuestion.includes('化学')) {
      return '科学';
    }
    
    if (lowerQuestion.includes('生活') || lowerQuestion.includes('日常') || 
        lowerQuestion.includes('家庭') || lowerQuestion.includes('购物') ||
        lowerQuestion.includes('做饭') || lowerQuestion.includes('天气')) {
      return '生活';
    }
    
    if (lowerQuestion.includes('娱乐') || lowerQuestion.includes('游戏') || 
        lowerQuestion.includes('电影') || lowerQuestion.includes('音乐') ||
        lowerQuestion.includes('体育') || lowerQuestion.includes('旅游')) {
      return '娱乐';
    }
    
    return '其他';
  };

  // 过滤聊天记录
  const filterChatLogs = (logs: ChatLog[], category: string) => {
    if (!category) return logs;
    return logs.filter(log => log.category === category);
  };

  // 导出为CSV格式
  const exportToCSV = async () => {
    const dataToExport = selectedCategory ? filteredChatLogs : chatLogs;
    
    // 如果没有数据，显示提示
    if (dataToExport.length === 0) {
      alert(selectedCategory ? `暂无${selectedCategory}相关的对话记录可导出` : '暂无对话记录可导出');
      return;
    }

    setIsExporting(true);
    try {
      const dataToExport = selectedCategory ? filteredChatLogs : chatLogs;
      
      // CSV 头部
      const headers = ['ID', '用户名', '邮箱', '问题', '回答', '分类', '时间'];
      
      // CSV 内容
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(log => [
          log.id,
          `"${log.username}"`,
          `"${log.email}"`,
          `"${log.question.replace(/"/g, '""')}"`, // 转义双引号
          `"${log.answer.replace(/"/g, '""')}"`,
          `"${log.category || '其他'}"`,
          `"${new Date(log.timestamp).toLocaleString()}"`
        ].join(','))
      ].join('\n');
      
      // 创建下载链接
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      const fileName = selectedCategory 
        ? `对话记录_${selectedCategory}_${new Date().toISOString().split('T')[0]}.csv`
        : `对话记录_全部_${new Date().toISOString().split('T')[0]}.csv`;
      link.setAttribute('download', fileName);
      
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // 检查登录状态
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('admin-user') || '{}');
    if (!token || user.role !== 'admin') {
      window.history.pushState({}, '', '/admin/login');
      window.location.reload();
      return;
    }
  }, [token]);

  // 加载用户数据
  const loadUserData = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3003/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUsers(userData);
      } else {
        console.error('获取用户数据失败');
        setUsers([]);
      }
    } catch (error) {
      console.error('加载用户数据失败:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // 加载聊天记录
  const loadChatLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://10.14.53.120:8080/api/conversation/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        // 处理后端返回的数据格式
        const logsData = result.data?.list || result.data || result;
        
        // 为每个对话记录添加分类
        const logsWithCategory = logsData.map((log: any) => {
          // 解析content字段中的JSON数据
          let question = '';
          let answer = '';
          
          try {
            const content = typeof log.content === 'string' ? JSON.parse(log.content) : log.content;
            question = content.question || '';
            answer = content.answer || '';
          } catch (e) {
            question = log.title || '';
            answer = log.content || '';
          }
          
          return {
            id: log.id?.toString() || '',
            username: log.username || '未知用户',
            email: log.email || '',
            question,
            answer,
            timestamp: log.create_time || log.createTime || new Date().toISOString(),
            category: categorizeQuestion(question)
          };
        });
        
        setChatLogs(logsWithCategory);
        // 初始化过滤后的数据
        setFilteredChatLogs(filterChatLogs(logsWithCategory, selectedCategory));
      } else {
        console.error('获取聊天记录失败');
        setChatLogs([]);
        setFilteredChatLogs([]);
      }
    } catch (error) {
      console.error('加载聊天记录失败:', error);
      setChatLogs([]);
      setFilteredChatLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // 处理分类变化
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setFilteredChatLogs(filterChatLogs(chatLogs, category));
  };

  // 切换标签页时加载对应数据
  useEffect(() => {
    if (activeTab === 'users') {
      loadUserData();
    } else if (activeTab === 'chats') {
      loadChatLogs();
    }
  }, [activeTab, token]);

  // 登出功能
  const handleLogout = () => {
    localStorage.removeItem('admin-token');
    localStorage.removeItem('admin-user');
    window.history.pushState({}, '', '/admin/login');
    window.location.reload();
  };

  // 获取当前管理员信息
  const adminUser = JSON.parse(localStorage.getItem('admin-user') || '{}');

  return (
    <div className="dashboard-body">
      {/* 测试元素 - 强制显示 */}
      <div style={{position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'red', color: 'white', padding: '10px', borderRadius: '5px'}}>
        测试: activeTab={activeTab} | 这是测试文字，如果您能看到说明页面正常
      </div>
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="header-left">
            <h1>FastGPT 认证系统管理后台</h1>
            <p>欢迎回来，{adminUser.username || '管理员'}</p>
          </div>
          <div className="header-right">
            <div className="status">
              <div className="status-dot"></div>
              <span>系统正常运行中</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </header>
        
        <div className="tabs">
          <div 
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <span className="tab-icon">👥</span>
            用户管理
          </div>
          <div 
            className={`tab ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            <span className="tab-icon">💬</span>
            对话记录
          </div>
          <div 
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="tab-icon">⚙️</span>
            系统设置
          </div>
        </div>

        {loading && (
          <div className="loading">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        )}

        {activeTab === 'users' && !loading && (
          <div className="tab-content">
            <div className="content-header">
              <h2>用户列表</h2>
              <div className="stats">
                <div className="stat-item">
                  <span className="stat-number">{users.length}</span>
                  <span className="stat-label">总用户数</span>
                </div>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>用户名</th>
                    <th>邮箱</th>
                    <th>角色</th>
                    <th>注册时间</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map(user => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`badge badge-${user.role}`}>
                            {user.role}
                          </span>
                        </td>
                        <td>{user.createdAt ? new Date(user.createdAt).toLocaleString() : '未知'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="no-data">暂无用户数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'chats' && !loading && (
          <div className="tab-content">
            <div className="content-header">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <h2>对话记录</h2>
                <button 
                  onClick={exportToCSV}
                  disabled={isExporting}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                >
                  📊 {isExporting ? '导出中...' : '导出CSV'}
                </button>
              </div>
              <div className="header-controls">
                <div className="filter-section">
                  <label htmlFor="category-select">分类筛选：</label>
                  <select 
                    id="category-select"
                    value={selectedCategory} 
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="category-select"
                  >
                    {CATEGORIES.map(category => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={exportToCSV}
                  disabled={isExporting}
                  className="export-btn"
                  title={(selectedCategory ? filteredChatLogs.length === 0 : chatLogs.length === 0) ? "暂无数据可导出" : "导出CSV文件"}
                  style={{ backgroundColor: isExporting ? '#9ca3af' : '#10b981' }} // 强制样式确保可见性
                >
                  {isExporting ? '导出中...' : '导出CSV'}
                </button>
              </div>
              <div className="stats">
                <div className="stat-item">
                  <span className="stat-number">
                    {selectedCategory ? filteredChatLogs.length : chatLogs.length}
                  </span>
                  <span className="stat-label">
                    {selectedCategory ? `${selectedCategory}相关记录` : '总对话记录'}
                  </span>
                </div>
                {selectedCategory && (
                  <div className="stat-item">
                    <span className="stat-number">{chatLogs.length}</span>
                    <span className="stat-label">全部记录</span>
                  </div>
                )}
              </div>
            </div>
            <div className="chat-logs">
              {(selectedCategory ? filteredChatLogs : chatLogs).length > 0 ? (
                (selectedCategory ? filteredChatLogs : chatLogs).map(log => (
                  <div key={log.id} className="chat-card">
                    <div className="chat-header">
                      <div className="user-info">
                        <strong>{log.username}</strong> ({log.email})
                      </div>
                      <div className="chat-meta">
                        <span className={`category-badge category-${log.category?.toLowerCase()}`}>
                          {log.category}
                        </span>
                        <div className="chat-time">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="chat-question">
                      <div className="chat-label">问题</div>
                      <div className="chat-content">{log.question}</div>
                    </div>
                    <div className="chat-answer">
                      <div className="chat-label">回答</div>
                      <div className="chat-content">{log.answer}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-data">
                  {selectedCategory ? `暂无${selectedCategory}相关的对话记录` : '暂无对话记录'}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && !loading && (
          <div className="tab-content">
            <div className="content-header">
              <h2>系统设置</h2>
            </div>
            <div className="settings-content">
              <div className="settings-grid">
                <div className="settings-card">
                  <div className="settings-icon">🔐</div>
                  <h3>认证设置</h3>
                  <p>配置用户认证相关参数</p>
                  <button className="settings-btn">配置</button>
                </div>
                <div className="settings-card">
                  <div className="settings-icon">📊</div>
                  <h3>系统监控</h3>
                  <p>查看系统运行状态和性能指标</p>
                  <button className="settings-btn">查看</button>
                </div>
                <div className="settings-card">
                  <div className="settings-icon">🔧</div>
                  <h3>系统维护</h3>
                  <p>系统备份、清理和维护工具</p>
                  <button className="settings-btn">维护</button>
                </div>
                <div className="settings-card">
                  <div className="settings-icon">📝</div>
                  <h3>日志管理</h3>
                  <p>系统日志查看和管理</p>
                  <button className="settings-btn">管理</button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 备用导出按钮 - 始终可见 */}
        <div style={{position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000}}>
          <button 
            onClick={exportToCSV}
            disabled={isExporting}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            🔄 {isExporting ? '导出中...' : '强制导出CSV'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;