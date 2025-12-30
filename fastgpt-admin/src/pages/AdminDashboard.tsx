import React, { useEffect, useState } from 'react';
import config from '../config';
import AnnouncementModal from '../components/AnnouncementModal';
import './AdminDashboard.css';

interface User {
  id: string | number;
  username: string;
  email: string;
  role: string;
  createdAt?: string;
  userId?: number;
  userName?: string;
  create_time?: string;
  role_id?: number;
}

interface ChatLog {
  id: string | number;
  userId: string | number;
  username: string;
  email: string;
  question: string;
  answer: string;
  timestamp?: string;
  category?: string; // 添加分类字段
  createTime?: string;
  shareId?: string;
  outLinkUid?: string;
  appId?: string;
  chatId?: string;
  ipAddress?: string;
}

// 预定义的分类选项（更丰富的分类）
const CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: '计算机技术', label: '计算机技术' },
  { value: '数学与科学', label: '数学与科学' },
  { value: '医疗健康', label: '医疗健康' },
  { value: '教育学习', label: '教育学习' },
  { value: '商业金融', label: '商业金融' },
  { value: '法律政策', label: '法律政策' },
  { value: '艺术創作', label: '艺术創作' },
  { value: '体育运动', label: '体育运动' },
  { value: '美食烹饪', label: '美食烹饪' },
  { value: '旅行交通', label: '旅行交通' },
  { value: '家庭生活', label: '家庭生活' },
  { value: '心理情感', label: '心理情感' },
  { value: '娱乐休闲', label: '娱乐休闲' },
  { value: '新闻时事', label: '新闻时事' },
  { value: '历史文化', label: '历史文化' },
  { value: '环保生态', label: '环保生态' },
  { value: '其他', label: '其他' }
];

interface AdminDashboardProps {
  onLogout?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [filteredChatLogs, setFilteredChatLogs] = useState<ChatLog[]>([]); // 过滤后的对话记录
  const [activeTab, setActiveTab] = useState<'users' | 'chats' | 'admins' | 'feedbacks' | 'settings'>('chats'); // 添加 feedbacks 标签页
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(''); // 选中的分类
  const [isExporting, setIsExporting] = useState<boolean>(false); // 导出状态
  
  // 公告发布相关状态
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    priority: 0
  });
  
  // 用户查看公告相关状态
  const [showUserAnnouncements, setShowUserAnnouncements] = useState(false);
  const [hasShownAnnouncements, setHasShownAnnouncements] = useState(false); // 防止重复显示
  
  // Feedback 相关状态
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalChats: 0,
    todayChats: 0
  });
  
  // 管理员管理相关状态
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({
    username: '',
    email: '',
    password: ''
  });

  // 修改密码相关状态
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // 获取管理员 token
  const adminToken = localStorage.getItem('admin-token') || '';
  const adminUser = JSON.parse(localStorage.getItem('admin-user') || '{}');
  
  // 判断是否为超级管理员（默认admin账号或指定的超级管理员）
  const isSuperAdmin = adminUser.username === 'admin' || adminUser.isSuperAdmin === true;
  
  // AI分类相关状态
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [classifyMethod, setClassifyMethod] = useState<'keyword' | 'ai'>('keyword'); // 分类方式
  
  // 饼图显示状态
  const [showPieChart, setShowPieChart] = useState(false);

  // 检查管理员登录状态
  useEffect(() => {
    if (!adminToken || adminUser.role !== 'admin') {
      if (onLogout) {
        onLogout();
      }
      return;
    }
    
    // 登录成功后显示未读公告（仅首次）
    if (!hasShownAnnouncements) {
      setShowUserAnnouncements(true);
      setHasShownAnnouncements(true);
    }
  }, [adminToken, adminUser, onLogout, hasShownAnnouncements]);

  // 加载用户数据
  const loadUserData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.AUTH_API_URL}/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      console.log('=== 用户API返回的原始数据 ===', result);
      console.log('result.data的内容:', result.data);
      if (result.data && result.data.length > 0) {
        console.log('第一个用户的数据结构:', result.data[0]);
      }
      
      if (result.code === 1) {
        // 转换数据格式以匹配现有接口，支持多种字段名格式
        const userData = result.data.map((user: any) => {
          console.log('处理用户数据:', user);
          const mappedUser = {
            id: user.userId || user.user_id,
            username: user.userName || user.user_name || user.username || '未知',
            email: user.email || '未填写',
            role: user.role_id === 2 ? 'admin' : user.role || 'user',
            createdAt: user.create_time || user.createTime
          };
          console.log('映射后的用户数据:', mappedUser);
          return mappedUser;
        });
        
        setUsers(userData);
        setStats(prev => ({ ...prev, totalUsers: userData.length }));
      } else {
        console.error('获取用户数据失败:', result.msg);
        setUsers([]);
      }
    } catch (error) {
      console.error('加载用户数据失败:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // 备用的关键词匹配分类
  const categorizeQuestionFallback = (question: string): string => {
    const keywords = {
      '计算机技术': [
        '编程', '代码', '软件', '计算机', '网站', '程序', 'bug', '算法', '数据库', 
        'python', 'javascript', 'java', 'c++', 'html', 'css', '前端', '后端', 
        'AI', '人工智能', '机器学习', 'api', '框架', '开发', '调试', '系统', '服务器'
      ],
      '数学与科学': [
        '+', '-', '×', '÷', '=', '数学', '计算', '运算', '方程', '公式', 
        '加', '减', '乘', '除', '等于', '平方', '立方', '根号', '函数',
        '几何', '代数', '统计', '概率', '微积分', '三角', '矩阵',
        '科学', '实验', '研究', '理论', '物理', '化学', '生物',
        '滤波', '滤波器', '信号处理', '数字滤波', '低通', '高通', '带通', '带阻',
        '卡尔曼', 'FFT', '傅里叶', '频域', '时域', '采样', '量化', '噪声',
        '信号', '频率', '幅度', '相位', '滤除', '平滑', '去噪'
      ],
      '医疗健康': ['医院', '医生', '病', '治疗', '药', '健康', '症状', '诊断', '手术', '疫苗', '感冒', '发烧', '头痛', '医疗', '护士', '体检', '药物', '疾病'],
      '教育学习': ['学校', '老师', '学生', '教育', '学习', '课程', '考试', '作业', '大学', '高中', '小学', '培训', '知识', '书本', '教学', '题目', '解答', '学习'],
      '商业金融': ['公司', '商业', '市场', '销售', '客户', '产品', '服务', '管理', '投资', '利润', '成本', '品牌', '竞争', '策略', '营销', '金融', '股票', '银行', '经济'],
      '法律政策': ['法律', '法规', '政策', '权利', '义务', '合同', '起诉', '法院', '律师', '法条', '行政', '政府', '法制'],
      '艺术創作': ['绘画', '音乐', '舞蹈', '摄影', '设计', '书法', '雕塑', '文学', '诗歌', '小说', '写作', '创作', '艺术'],
      '体育运动': ['体育', '运动', '足球', '篮球', '游泳', '跑步', '健身', '网球', '乒乓球', '羽毛球', '骑车', '比赛'],
      '美食烹饪': ['做菜', '烹饪', '美食', '食谱', '菜谱', '做饭', '烹调', '吃', '味道', '食材', '营养', '料理'],
      '旅行交通': ['旅行', '旅游', '出游', '景点', '酒店', '交通', '飞机', '火车', '地铁', '出行', '签证', '导游'],
      '家庭生活': ['家庭', '家居', '装修', '家务', '育儿', '家长', '生活', '购物', '日常', '居家'],
      '心理情感': ['心理', '情感', '心情', '压力', '焦虑', '抑郁', '爱情', '友情', '婚姻', '人际关系', '情绪'],
      '娱乐休闲': ['电影', '电视剧', '综艺', '明星', '娱乐', '游戏', '休闲', '放松', '娱乐圈'],
      '新闻时事': ['新闻', '时事', '政治', '国际', '社会', '经济', '事件', '热点', '新闻'],
      '历史文化': ['历史', '文化', '传统', '古代', '文物', '博物馆', '民俗', '传承', '古典'],
      '环保生态': ['环保', '生态', '气候', '污染', '节能', '可持续', '绿色', '生态', '环境']
    };
    
    // 特殊处理数学表达式
    const mathPattern = /^\s*\d+\s*[\+\-\×\÷\*\/]\s*\d+\s*=?\s*$/;
    if (mathPattern.test(question) || /[0-9]+[\+\-\×\÷\*\/][0-9]+/.test(question)) {
      return '数学与科学';
    }
    
    // 转换为小写进行匹配
    const lowerQuestion = question.toLowerCase();
    
    for (const [category, keywordList] of Object.entries(keywords)) {
      if (keywordList.some(keyword => lowerQuestion.includes(keyword.toLowerCase()))) {
        return category;
      }
    }
    return '其他';
  };

  // AI智能分类（调用本地 qwen 模型）
  const categorizeQuestionByAI = async (question: string): Promise<string> => {
    try {
      const prompt = `你是一个专业的问题分类助手。请根据问题的核心内容，从以下分类中选择最合适的一个，只输出分类名称。

## 分类规则：
- **计算机技术**: 编程、软件、硬件、网络、算法、数据结构、AI、数据库、操作系统、网络安全等
- **数学与科学**: 数学计算、物理、化学、生物、天文、地理、工程技术、信号处理、滤波算法等
- **医疗健康**: 疾病、症状、治疗、药品、健康保健、医学知识等
- **教育学习**: 学习方法、考试、课程、教材、培训、学科知识等
- **商业金融**: 创业、投资、理财、经济、市场、营销、管理等
- **法律政策**: 法律法规、政策、权益、合同、诉讼等
- **艺术創作**: 绘画、音乐、设计、摄影、写作、文学等
- **体育运动**: 运动项目、健身、比赛、运动员、体育知识等
- **美食烹饪**: 菜谱、烹饪技巧、食材、餐饮等
- **旅行交通**: 旅游、景点、交通工具、出行攻略等
- **家庭生活**: 家务、育儿、家居、宠物、人际关系等
- **心理情感**: 心理健康、情绪、人际沟通、恋爱、婚姻等
- **娱乐休闲**: 游戏、电影、音乐、综艺、明星、休闲活动等
- **新闻时事**: 时事新闻、社会事件、政治、国际关系等
- **历史文化**: 历史事件、文化传统、考古、文物等
- **环保生态**: 环境保护、气候、生态、可持续发展等
- **其他**: 无法明确归类或跨多个领域的问题

## 分类示例：
问题: "如何用Python实现快速排序？"
分类: 计算机技术

问题: "数字滤波器的设计方法有哪些？"
分类: 数学与科学

问题: "低通滤波和高通滤波的区别"
分类: 数学与科学

问题: "React和Vue哪个更好？"
分类: 计算机技术

问题: "如何治疗感冒？"
分类: 医疗健康

问题: "北京有哪些好玩的地方？"
分类: 旅行交通

## 待分类问题：
${question}

## 输出格式：只输出分类名称，不要任何解释
分类：`;

      // 使用更强的模型以提高准确率
      const modelName = 'qwen2.5:32b-instruct-q4_K_M'; // 使用32B模型，准确率更高
      
      const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 50
        })
      });

      if (!response.ok) {
        console.error('AI分类失败，使用关键词分类');
        return categorizeQuestionFallback(question);
      }

      const data = await response.json();
      const category = data.choices?.[0]?.message?.content?.trim() || '';
      
      // 验证分类是否在预定义列表中
      const validCategories = CATEGORIES.map(c => c.value).filter(v => v !== '');
      if (validCategories.includes(category)) {
        return category;
      }
      
      // 如果AI返回的分类不在列表中，尝试模糊匹配
      const matchedCategory = validCategories.find(vc => 
        category.includes(vc) || vc.includes(category)
      );
      
      return matchedCategory || categorizeQuestionFallback(question);
    } catch (error) {
      console.error('AI分类出错:', error);
      return categorizeQuestionFallback(question);
    }
  };

  // 批量AI分类（后台处理）
  const batchClassifyWithAI = async (logs: ChatLog[]): Promise<ChatLog[]> => {
    setIsAiClassifying(true);
    setClassifyProgress(0);
    
    const classified: ChatLog[] = [];
    const batchSize = 5; // 每批处理5条，避免API过载
    
    for (let i = 0; i < logs.length; i += batchSize) {
      const batch = logs.slice(i, i + batchSize);
      
      const classifiedBatch = await Promise.all(
        batch.map(async (log) => {
          if (log.question && log.question.trim()) {
            const category = await categorizeQuestionByAI(log.question);
            return { ...log, category };
          }
          return { ...log, category: '其他' };
        })
      );
      
      classified.push(...classifiedBatch);
      setClassifyProgress(Math.round((classified.length / logs.length) * 100));
      
      // 每批处理后稍微延迟，避免过载
      if (i + batchSize < logs.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsAiClassifying(false);
    return classified;
  };

  // 筛选聊天记录
  const filterChatLogs = (logs: ChatLog[], category: string): ChatLog[] => {
    if (!category || category === '') {
      return logs;
    }
    return logs.filter(log => log.category === category);
  };

  // 导出CSV功能
  const exportToCSV = async () => {
    const dataToExport = selectedCategory ? filteredChatLogs : chatLogs;
    
    // 如果没有数据，显示提示
    if (dataToExport.length === 0) {
      alert(selectedCategory ? `暂无${selectedCategory}相关的对话记录可导出` : '暂无对话记录可导出');
      return;
    }

    setIsExporting(true);
    try {
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
          `"${log.category || '未分类'}"`,
          `"${new Date(log.timestamp || log.createTime || '').toLocaleString()}"`
        ].join(','))
      ].join('\n');
      
      // 创建并下载文件
      const BOM = '\uFEFF'; // UTF-8 BOM
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const fileName = `对话记录_${selectedCategory || '全部'}_${new Date().toLocaleString().replace(/[/:]/g, '-')}.csv`;
      link.setAttribute('href', url);
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

  // 处理分类变化
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setFilteredChatLogs(filterChatLogs(chatLogs, category));
  };

  // 计算分类统计数据
  const getCategoryStats = () => {
    const stats: { [key: string]: number } = {};
    const total = chatLogs.length;
    
    // 统计每个分类的数量
    chatLogs.forEach(log => {
      const category = log.category || '未分类';
      stats[category] = (stats[category] || 0) + 1;
    });
    
    // 转换为百分比并排序
    return Object.entries(stats)
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.count - a.count);
  };

  // 加载聊天记录
  const loadChatLogs = async () => {
    setLoading(true);
    try {
      // 使用正确的API端点，增加pageSize以获取更多记录
      const response = await fetch(`${config.AUTH_API_URL}/conversation/logs?page=0&pageSize=1000`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json'
          // 注意：这里移除了Authorization头，因为后端可能不需要
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('API返回数据:', result); // 调试日志
        
        // 处理后端返回的数据格式
        let logsData: ChatLog[] = [];
        if (result.code === 1 && result.data) {
          console.log('原始数据列表:', result.data.list || result.data); // 调试原始数据
          
          // 从后端返回的格式转换
          logsData = (result.data.list || result.data).map((log: any, index: number) => {
            console.log(`处理第${index}条记录:`, log); // 调试每条记录
            
            // 解析 content JSON 字段
            let content = { question: '', answer: '', shareId: '', appId: '' };
            try {
              if (log.content) {
                content = JSON.parse(log.content);
                console.log(`第${index}条记录解析后的content:`, content);
              }
            } catch (e) {
              console.log(`第${index}条记录JSON解析失败，使用原始content:`, log.content);
              content.question = log.content || '';
            }

            const question = content.question || log.title || '';
            
            // 使用分类功能（根据选择的方法）
            let category = '其他';
            if (question.trim()) {
              category = categorizeQuestionFallback(question); // 先用关键词快速分类
              console.log(`第${index}条记录分类结果:`, category);
            }
            
            const processedLog = {
              id: log.id,
              userId: log.userId || log.user_id,
              username: log.username || log.userName || log.user_name || '用户' + (log.userId || log.user_id || '未知'),
              email: log.email || '未知',
              question: question,
              answer: content.answer || '',
              timestamp: log.createTime || log.create_time,
              shareId: content.shareId || '',
              appId: content.appId || '',
              category: category // AI自动分类
            };
            
            console.log(`第${index}条记录处理结果:`, processedLog);
            return processedLog;
          });
        }
        
        console.log('最终处理的数据:', logsData);
        setChatLogs(logsData);
        setFilteredChatLogs(filterChatLogs(logsData, selectedCategory)); // 设置筛选后的数据
        
        // 如果选择了AI分类，自动执行后台分类
        if (classifyMethod === 'ai' && logsData.length > 0) {
          console.log('开始AI批量分类...');
          batchClassifyWithAI(logsData).then(classifiedLogs => {
            console.log('AI分类完成:', classifiedLogs);
            setChatLogs(classifiedLogs);
            setFilteredChatLogs(filterChatLogs(classifiedLogs, selectedCategory));
          }).catch(err => {
            console.error('AI批量分类失败:', err);
          });
        }
        
        // 计算今日对话数量
        const today = new Date().toDateString();
        const todayChats = logsData.filter((log: ChatLog) => {
          const logTime = log.timestamp;
          return logTime ? new Date(logTime).toDateString() === today : false;
        }).length;
        
        setStats(prev => ({ 
          ...prev, 
          totalChats: result.data?.total || logsData.length,
          todayChats 
        }));
      } else {
        console.error('获取聊天记录失败');
        setChatLogs([]);
      }
    } catch (error) {
      console.error('加载聊天记录失败:', error);
      setChatLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // 切换标签页时加载对应数据
  useEffect(() => {
    if (activeTab === 'users') {
      loadUserData();
    } else if (activeTab === 'chats') {
      loadChatLogs();
    } else if (activeTab === 'admins') {
      loadAdminUsers();
    } else if (activeTab === 'feedbacks') {
      loadFeedbacks();
    }
  }, [activeTab, adminToken]);

  // 加载反馈列表
  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8080/api/feedbacks/all'
        : 'http://10.14.53.120:8080/api/feedbacks/all';
      console.log('开始加载反馈列表...', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('响应状态:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('反馈列表响应:', result);
      console.log('第一条反馈数据:', result.data?.[0]); // 查看第一条数据的完整结构
      
      if (result.code === 200) {
        setFeedbacks(result.data || []);
        console.log('加载了', result.data?.length || 0, '条反馈');
        // 打印每条反馈的字段
        if (result.data && result.data.length > 0) {
          console.log('反馈数据字段:', Object.keys(result.data[0]));
        }
      } else {
        alert('加载反馈失败：' + (result.message || '未知错误'));
      }
    } catch (error: any) {
      console.error('加载反馈列表失败:', error);
      alert('加载反馈列表失败：' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  // 发布公告函数
  const handlePublishAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      alert('请填写标题和内容');
      return;
    }

    try {
      const requestData = {
        adminUserId: adminUser.userId || adminUser.id || 1,
        title: announcementForm.title,
        content: announcementForm.content,
        priority: announcementForm.priority
      };
      
      const apiUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:8080/api/announcements/create'
        : 'http://10.14.53.120:8080/api/announcements/create';
      
      console.log('发布公告请求数据:', requestData);
      console.log('API地址:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      console.log('响应状态:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('公告发布响应:', result);
      
      if (result.code === 200) {
        alert('公告发布成功！ID: ' + (result.data?.announcementId || ''));
        setShowAnnouncementModal(false);
        setAnnouncementForm({ title: '', content: '', priority: 0 });
      } else {
        alert('公告发布失败：' + (result.message || '未知错误'));
      }
    } catch (error: any) {
      console.error('发布公告失败:', error);
      alert('发布公告失败：' + (error.message || error));
    }
  };

  // 删除反馈
  const handleDeleteFeedback = async (fbId: number) => {
    if (!confirm('确定要删除这条反馈吗？')) {
      return;
    }

    try {
      const apiUrl = window.location.hostname === 'localhost'
        ? `http://localhost:8080/api/feedbacks/delete/${fbId}`
        : `http://10.14.53.120:8080/api/feedbacks/delete/${fbId}`;
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.code === 200) {
        alert('反馈删除成功');
        loadFeedbacks();
      } else {
        alert('删除失败：' + result.message);
      }
    } catch (error) {
      console.error('删除反馈失败:', error);
      alert('删除反馈失败');
    }
  };

  // 加载管理员列表
  const loadAdminUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.AUTH_API_URL}/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      console.log('=== 管理员API返回的原始数据 ===', result);
      
      if (result.code === 1 && result.data) {
        // 筛选出管理员 (role_id === 2 或 role === 'admin')
        const admins = result.data
          .filter((user: any) => user.role === 'admin' || user.role_id === 2)
          .map((user: any) => {
            console.log('处理管理员数据:', user);
            const mappedAdmin = {
              id: user.userId || user.user_id,
              userId: user.userId || user.user_id,
              username: user.userName || user.user_name || user.username || '未知',
              userName: user.userName || user.user_name || user.username,
              email: user.email || '未填写',
              role: 'admin',
              role_id: 2,
              createdAt: user.create_time || user.createTime,
              create_time: user.create_time || user.createTime
            };
            console.log('映射后的管理员数据:', mappedAdmin);
            return mappedAdmin;
          });
        console.log('最终的管理员列表:', admins);
        setAdminUsers(admins);
      }
    } catch (error) {
      console.error('加载管理员列表失败:', error);
      alert('加载管理员列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 提升用户为管理员（仅超级管理员可操作）
  const promoteToAdmin = async (userId: string | number) => {
    if (!isSuperAdmin) {
      alert('只有超级管理员才能提升用户为管理员！');
      return;
    }

    if (!confirm('确认将此用户提升为管理员吗？\n\n注意：该用户将获得管理员权限，可以查看所有用户数据和对话记录。')) {
      return;
    }

    try {
      const response = await fetch(`${config.AUTH_API_URL}/users/${userId}/promote`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      });

      const result = await response.json();
      
      if (result.code === 1) {
        alert('提升成功！');
        loadAdminUsers();
        loadUserData();
      } else {
        alert('提升失败: ' + (result.msg || result.message || '未知错误'));
      }
    } catch (error) {
      console.error('提升管理员失败:', error);
      alert('提升失败，请检查网络连接');
    }
  };

  // 降级管理员为普通用户（仅超级管理员可操作）
  const demoteAdmin = async (userId: string | number) => {
    if (!isSuperAdmin) {
      alert('只有超级管理员才能降级管理员！');
      return;
    }

    // 防止降级自己
    if ((adminUser.id || adminUser.userId) === userId) {
      alert('不能降级自己！');
      return;
    }

    if (!confirm('确认将此管理员降为普通用户吗？\n\n该操作将移除其管理员权限。')) {
      return;
    }

    try {
      const response = await fetch(`${config.AUTH_API_URL}/users/${userId}/demote`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      });

      const result = await response.json();
      
      if (result.code === 1) {
        alert('降级成功！');
        loadAdminUsers();
        loadUserData();
      } else {
        alert('降级失败: ' + (result.msg || result.message || '未知错误'));
      }
    } catch (error) {
      console.error('降级失败:', error);
      alert('降级失败，请检查网络连接');
    }
  };

  // 创建新管理员（仅超级管理员可操作）
  const createAdmin = async () => {
    if (!isSuperAdmin) {
      alert('只有超级管理员才能创建新管理员！');
      setShowAddAdminModal(false);
      return;
    }

    if (!newAdminForm.username || !newAdminForm.email || !newAdminForm.password) {
      alert('请填写完整信息');
      return;
    }

    if (newAdminForm.password.length < 6) {
      alert('密码长度至少为6位');
      return;
    }

    try {
      const response = await fetch(`${config.AUTH_API_URL}/users/create-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(newAdminForm)
      });

      const result = await response.json();
      
      if (result.code === 1) {
        alert('管理员创建成功！\n\n用户名: ' + newAdminForm.username + '\n密码: ' + newAdminForm.password + '\n\n请妥善保管！');
        setShowAddAdminModal(false);
        setNewAdminForm({ username: '', email: '', password: '' });
        loadAdminUsers();
      } else {
        alert('创建失败: ' + (result.msg || result.message || '未知错误'));
      }
    } catch (error) {
      console.error('创建管理员失败:', error);
      alert('创建失败，请检查网络连接');
    }
  };

  // 登出功能
  const handleLogout = () => {
    localStorage.removeItem('admin-token');
    localStorage.removeItem('admin-user');
    if (onLogout) {
      onLogout();
    }
  };

  // 修改密码
  const handleChangePassword = async () => {
    if (!changePasswordForm.oldPassword || !changePasswordForm.newPassword || !changePasswordForm.confirmPassword) {
      alert('请填写完整信息');
      return;
    }

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      alert('两次输入的新密码不一致');
      return;
    }

    if (changePasswordForm.newPassword.length < 6) {
      alert('新密码长度至少为6位');
      return;
    }

    try {
      const response = await fetch(`${config.AUTH_API_URL}/users/${adminUser.userId}/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          oldPassword: changePasswordForm.oldPassword,
          newPassword: changePasswordForm.newPassword
        })
      });

      const result = await response.json();
      
      if (result.code === 1) {
        alert('密码修改成功！请重新登录。');
        setShowChangePasswordModal(false);
        setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
        handleLogout();
      } else {
        alert('密码修改失败: ' + (result.msg || result.message || '旧密码不正确'));
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      alert('修改密码失败，请检查网络连接');
    }
  };

  // 删除用户
  const handleDeleteUser = async (userId: string | number) => {
    if (!confirm('确定要删除这个用户吗？此操作不可撤销。')) {
      return;
    }

    try {
      const response = await fetch(`${config.AUTH_API_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.code === 1) {
        // 删除成功，重新加载用户数据
        loadUserData();
        alert('删除用户成功');
      } else {
        alert(result.msg || '删除用户失败');
      }
    } catch (error) {
      console.error('删除用户失败:', error);
      alert('删除操作失败，请稍后重试');
    }
  };

  return (
    <div className="admin-dashboard-body">
      {/* 用户未读公告弹窗 */}
      {showUserAnnouncements && (adminUser.userId || adminUser.id) && (
        <AnnouncementModal 
          userId={adminUser.userId || adminUser.id} 
          onClose={() => setShowUserAnnouncements(false)}
        />
      )}
      
      <div className="admin-dashboard-container">
        <header className="admin-dashboard-header">
          <div className="header-left">
            <h1>FastGPT 认证系统管理后台</h1>
            <p>欢迎回来，{adminUser.username}</p>
          </div>
          <div className="header-right">
            <div className="status-indicator">
              <div className="status-dot"></div>
              <span>系统正常运行</span>
            </div>
            <button className="change-password-btn" onClick={() => setShowChangePasswordModal(true)}>
              🔑 修改密码
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </header>

        {/* 统计卡片 */}
        <div className="stats-section">
          <div className="stat-card">
            <div className="stat-icon users-icon">👥</div>
            <div className="stat-content">
              <h3>总用户数</h3>
              <p>{stats.totalUsers}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon chats-icon">💬</div>
            <div className="stat-content">
              <h3>总对话数</h3>
              <p>{stats.totalChats}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon today-icon">📈</div>
            <div className="stat-content">
              <h3>今日对话</h3>
              <p>{stats.todayChats}</p>
            </div>
          </div>
        </div>
        
        <div className="tabs-section">
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
            className={`tab ${activeTab === 'admins' ? 'active' : ''}`}
            onClick={() => setActiveTab('admins')}
          >
            <span className="tab-icon">🔐</span>
            管理员管理
          </div>
          <div 
            className={`tab ${activeTab === 'feedbacks' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedbacks')}
          >
            <span className="tab-icon">💭</span>
            用户反馈
          </div>
          <div 
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="tab-icon">⚙️</span>
            系统设置
          </div>
          
          {/* 发布公告按钮（醒目位置） */}
          <button 
            className="publish-announcement-btn"
            onClick={() => setShowAnnouncementModal(true)}
            style={{
              marginLeft: 'auto',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            }}
          >
            📢 发布全局公告
          </button>
        </div>

        {loading && (
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        )}

        {activeTab === 'users' && !loading && (
          <div className="tab-content">
            <div className="content-header">
              <h2>用户列表</h2>
              <button className="refresh-btn" onClick={loadUserData}>
                🔄 刷新
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>邮箱</th>
                    <th>角色</th>
                    <th>注册时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map((user, index) => (
                      <tr key={user.id || `user-${index}`}>
                        <td>{user.username || user.userName || '未知'}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`role-badge role-${user.role}`}>
                            {user.role}
                          </span>
                        </td>
                        <td>{user.createdAt ? new Date(user.createdAt).toLocaleString() : '未知'}</td>
                        <td>
                          {user.role !== 'admin' && (
                            <button 
                              className="delete-btn"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              删除
                            </button>
                          )}
                        </td>
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
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: '20px'}}>
                <h2 style={{margin: 0}}>对话记录</h2>
                <div style={{display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '70%'}}>
                  {/* 分类方式选择 */}
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'}}>
                    <label style={{fontSize: '14px'}}>分类方式：</label>
                    <select 
                      value={classifyMethod} 
                      onChange={(e) => {
                        setClassifyMethod(e.target.value as 'keyword' | 'ai');
                        // 切换分类方式后重新加载数据
                        if (e.target.value === 'ai' && chatLogs.length > 0) {
                          batchClassifyWithAI(chatLogs).then(classifiedLogs => {
                            setChatLogs(classifiedLogs);
                            setFilteredChatLogs(filterChatLogs(classifiedLogs, selectedCategory));
                          });
                        }
                      }}
                      disabled={isAiClassifying}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        minWidth: '120px'
                      }}
                    >
                      <option value="keyword">关键词快速分类</option>
                      <option value="ai">AI智能分类</option>
                    </select>
                    {isAiClassifying && (
                      <span style={{
                        color: '#6366f1',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}>
                        分类中... {classifyProgress}%
                      </span>
                    )}
                  </div>
                  
                  {/* 分类筛选 */}
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'}}>
                    <label style={{fontSize: '14px'}}>分类筛选：</label>
                    <select 
                      value={selectedCategory} 
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        minWidth: '120px',
                        fontSize: '14px'
                      }}
                    >
                      {CATEGORIES.map(category => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <button 
                    onClick={() => setShowPieChart(!showPieChart)}
                    style={{
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📈 {showPieChart ? '隐藏' : '显示'}统计
                  </button>
                  
                  <button 
                    onClick={exportToCSV}
                    disabled={isExporting}
                    style={{
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isExporting ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      whiteSpace: 'nowrap',
                      opacity: isExporting ? 0.6 : 1
                    }}
                  >
                    📊 {isExporting ? '导出中...' : '导出CSV'}
                  </button>
                  
                  <button 
                    className="refresh-btn" 
                    onClick={loadChatLogs}
                    style={{
                      padding: '10px 16px',
                      fontSize: '14px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    🔄 刷新
                  </button>
                </div>
              </div>
            </div>
            
            {/* 饼图统计 - 独立显示在按钮和对话记录之间 */}
            {showPieChart && (
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '12px',
                padding: '20px',
                margin: '20px 0',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{color: 'white', marginBottom: '20px', fontSize: '18px'}}>📊 分类统计分析</h3>
                <div style={{
                  display: 'flex',
                  gap: '30px',
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}>
                  {/* 简易饼图 */}
                  <div style={{
                    width: '200px',
                    height: '200px',
                    borderRadius: '50%',
                    background: `conic-gradient(${getCategoryStats().map((stat, index) => {
                      const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
                      const startPercent = getCategoryStats().slice(0, index).reduce((sum, s) => sum + parseFloat(s.percentage), 0);
                      const endPercent = startPercent + parseFloat(stat.percentage);
                      return `${colors[index % colors.length]} ${startPercent}% ${endPercent}%`;
                    }).join(', ')})`,
                    boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
                    flexShrink: 0
                  }}></div>
                  
                  {/* 统计列表 */}
                  <div style={{flex: 1, minWidth: '300px'}}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '12px'
                    }}>
                      {getCategoryStats().map((stat, index) => {
                        const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
                        return (
                          <div 
                            key={stat.name}
                            style={{
                              background: 'rgba(255,255,255,0.15)',
                              backdropFilter: 'blur(10px)',
                              borderRadius: '8px',
                              padding: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <div style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '4px',
                              background: colors[index % colors.length],
                              flexShrink: 0
                            }}></div>
                            <div style={{flex: 1, minWidth: 0}}>
                              <div style={{
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: '600',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {stat.name}
                              </div>
                              <div style={{
                                color: 'rgba(255,255,255,0.8)',
                                fontSize: '12px',
                                marginTop: '2px'
                              }}>
                                {stat.count}条 ({stat.percentage}%)
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="content-header">
              <div style={{marginBottom: '15px', color: '#666', fontSize: '14px'}}>
                显示 {selectedCategory ? filteredChatLogs.length : chatLogs.length} 条记录
                {selectedCategory && ` (${selectedCategory}分类)`}
              </div>
            </div>
            
            <div className="chat-logs-container">
              {(selectedCategory ? filteredChatLogs : chatLogs).length > 0 ? (
                (selectedCategory ? filteredChatLogs : chatLogs).map(log => (
                  <div key={log.id} className="chat-log-card">
                    <div className="chat-log-header">
                      <div className="user-info">
                        <strong>{log.username}</strong> ({log.email})
                        {log.shareId && <span className="share-badge">分享: {log.shareId}</span>}
                        {log.category && <span className="category-badge" style={{
                          background: '#e9ecef',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          marginLeft: '10px'
                        }}>{log.category}</span>}
                      </div>
                      <div className="chat-time">
                        {(log.timestamp || log.createTime) ? new Date(log.timestamp || log.createTime || '').toLocaleString() : '未知时间'}
                      </div>
                    </div>
                    <div className="chat-meta">
                      {log.ipAddress && <span className="meta-item">IP: {log.ipAddress}</span>}
                      {log.appId && <span className="meta-item">应用ID: {log.appId}</span>}
                    </div>
                    <div className="chat-question">
                      <div className="message-label">问题:</div>
                      <div className="message-content">{log.question}</div>
                    </div>
                    <div className="chat-answer">
                      <div className="message-label">回答:</div>
                      <div className="message-content">{log.answer}</div>
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

        {activeTab === 'admins' && !loading && (
          <div className="tab-content">
            <div className="header-actions">
              <h2>🔐 管理员管理</h2>
              {isSuperAdmin && (
                <button className="add-btn" onClick={() => setShowAddAdminModal(true)}>
                  ➕ 添加管理员
                </button>
              )}
            </div>
            
            {!isSuperAdmin && (
              <div className="permission-notice">
                <span className="notice-icon">⚠️</span>
                <div>
                  <strong>权限提示</strong>
                  <p>您是普通管理员，只能查看管理员列表。只有超级管理员（admin账号）才能添加、提升或降级管理员。</p>
                </div>
              </div>
            )}

            <div className="admin-stats">
              <div className="stat-card">
                <div className="stat-number">{adminUsers.length}</div>
                <div className="stat-label">管理员总数</div>
              </div>
            </div>

            <div className="user-table-container">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>邮箱</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((admin, index) => (
                    <tr key={admin.id || admin.userId || `admin-${index}`}>
                      <td><strong>{admin.username || admin.userName || '未知'}</strong></td>
                      <td>{admin.email}</td>
                      <td>{admin.createdAt || admin.create_time ? new Date(admin.createdAt || admin.create_time || '').toLocaleDateString() : '未知'}</td>
                      <td>
                        {isSuperAdmin ? (
                          <button 
                            className="demote-btn"
                            onClick={() => demoteAdmin(admin.id || admin.userId || 0)}
                            disabled={(admin.username || admin.userName) === 'admin'}
                            style={(admin.username || admin.userName) === 'admin' ? {opacity: 0.5, cursor: 'not-allowed'} : {}}
                          >
                            {(admin.username || admin.userName) === 'admin' ? '超级管理员' : '降为普通用户'}
                          </button>
                        ) : (
                          <span style={{color: '#999', fontSize: '13px'}}>
                            {(admin.username || admin.userName) === 'admin' ? '超级管理员' : '管理员'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {adminUsers.length === 0 && (
                <div className="no-data">暂无管理员</div>
              )}
            </div>

            {isSuperAdmin && (
              <>
                <div className="divider" style={{margin: '40px 0'}}></div>

                <h3>👥 从现有用户提升</h3>
                <div className="user-table-container">
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>用户名</th>
                        <th>邮箱</th>
                        <th>创建时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => u.role !== 'admin' && u.role_id !== 2).map(user => (
                        <tr key={user.id || user.userId}>
                          <td>{user.id || user.userId}</td>
                          <td>{user.username || user.userName}</td>
                          <td>{user.email}</td>
                          <td>{user.createdAt || user.create_time ? new Date(user.createdAt || user.create_time || '').toLocaleDateString() : '未知'}</td>
                          <td>
                            <button 
                              className="promote-btn"
                              onClick={() => promoteToAdmin(user.id || user.userId || 0)}
                            >
                              提升为管理员
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* 添加管理员弹窗 */}
            {showAddAdminModal && (
              <div className="modal-overlay" onClick={() => setShowAddAdminModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>创建新管理员</h3>
                  <div className="form-group">
                    <label>用户名:</label>
                    <input
                      type="text"
                      value={newAdminForm.username}
                      onChange={(e) => setNewAdminForm({...newAdminForm, username: e.target.value})}
                      placeholder="请输入用户名"
                    />
                  </div>
                  <div className="form-group">
                    <label>邮箱:</label>
                    <input
                      type="email"
                      value={newAdminForm.email}
                      onChange={(e) => setNewAdminForm({...newAdminForm, email: e.target.value})}
                      placeholder="请输入邮箱"
                    />
                  </div>
                  <div className="form-group">
                    <label>密码:</label>
                    <input
                      type="password"
                      value={newAdminForm.password}
                      onChange={(e) => setNewAdminForm({...newAdminForm, password: e.target.value})}
                      placeholder="请输入密码"
                    />
                  </div>
                  <div className="modal-actions">
                    <button className="cancel-btn" onClick={() => setShowAddAdminModal(false)}>
                      取消
                    </button>
                    <button className="confirm-btn" onClick={createAdmin}>
                      创建
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 修改密码弹窗 */}
        {showChangePasswordModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>🔑 修改密码</h3>
              <div className="form-group">
                <label>旧密码:</label>
                <input
                  type="password"
                  value={changePasswordForm.oldPassword}
                  onChange={(e) => setChangePasswordForm({...changePasswordForm, oldPassword: e.target.value})}
                  placeholder="请输入当前密码"
                />
              </div>
              <div className="form-group">
                <label>新密码:</label>
                <input
                  type="password"
                  value={changePasswordForm.newPassword}
                  onChange={(e) => setChangePasswordForm({...changePasswordForm, newPassword: e.target.value})}
                  placeholder="请输入新密码（至少6位）"
                />
              </div>
              <div className="form-group">
                <label>确认新密码:</label>
                <input
                  type="password"
                  value={changePasswordForm.confirmPassword}
                  onChange={(e) => setChangePasswordForm({...changePasswordForm, confirmPassword: e.target.value})}
                  placeholder="请再次输入新密码"
                />
              </div>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                }}>
                  取消
                </button>
                <button className="confirm-btn" onClick={handleChangePassword}>
                  确认修改
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'feedbacks' && !loading && (
          <div className="tab-content">
            <div className="content-header">
              <h2>用户反馈列表</h2>
              <button className="refresh-btn" onClick={loadFeedbacks}>
                🔄 刷新
              </button>
            </div>
            <div className="table-container">
              {feedbacks.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{width: '80px'}}>反馈ID</th>
                      <th style={{width: '100px'}}>用户ID</th>
                      <th style={{width: '150px'}}>用户名</th>
                      <th style={{width: '200px'}}>邮箱</th>
                      <th>反馈内容</th>
                      <th style={{width: '180px'}}>提交时间</th>
                      <th style={{width: '100px'}}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbacks.map((feedback) => (
                      <tr key={feedback.fbId}>
                        <td>{feedback.fbId}</td>
                        <td>{feedback.userId || '匿名'}</td>
                        <td>{feedback.userName || '未知'}</td>
                        <td>{feedback.email || '未填写'}</td>
                        <td style={{
                          maxWidth: '400px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {feedback.context}
                        </td>
                        <td>{feedback.upTime ? new Date(feedback.upTime).toLocaleString() : '未知时间'}</td>
                        <td>
                          <button 
                            className="delete-btn"
                            onClick={() => handleDeleteFeedback(feedback.fbId)}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#999',
                  fontSize: '16px'
                }}>
                  <div style={{fontSize: '48px', marginBottom: '20px'}}>📭</div>
                  暂无用户反馈
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && !loading && (
          <div className="tab-content">
            <h2>系统设置</h2>
            <div className="settings-grid">
              <div className="setting-card">
                <h3>🔐 认证设置</h3>
                <p>配置用户认证相关参数</p>
                <button className="setting-btn">配置</button>
              </div>
              <div className="setting-card">
                <h3>📊 系统监控</h3>
                <p>查看系统运行状态和性能指标</p>
                <button className="setting-btn">查看</button>
              </div>
              <div className="setting-card">
                <h3>📝 日志管理</h3>
                <p>查看和管理系统日志</p>
                <button className="setting-btn">管理</button>
              </div>
              <div className="setting-card">
                <h3>🛡️ 安全设置</h3>
                <p>配置安全策略和访问控制</p>
                <button className="setting-btn">设置</button>
              </div>
            </div>
          </div>
        )}
        
        {/* 发布公告弹窗 */}
        {showAnnouncementModal && (
          <div className="modal-overlay" onClick={() => setShowAnnouncementModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '600px'}}>
              <h3 style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                padding: '20px',
                margin: '-20px -20px 20px -20px',
                borderRadius: '12px 12px 0 0'
              }}>
                📢 发布全局公告
              </h3>
              
              <div className="form-group" style={{marginBottom: '20px'}}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  公告标题 *
                </label>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm({...announcementForm, title: e.target.value})}
                  placeholder="请输入公告标题（例如：系统维护通知）"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div className="form-group" style={{marginBottom: '20px'}}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  公告内容 *
                </label>
                <textarea
                  value={announcementForm.content}
                  onChange={(e) => setAnnouncementForm({...announcementForm, content: e.target.value})}
                  placeholder="请输入公告内容..."
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '15px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              
              <div className="form-group" style={{marginBottom: '30px'}}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  优先级
                </label>
                <div style={{display: 'flex', gap: '10px'}}>
                  <button
                    onClick={() => setAnnouncementForm({...announcementForm, priority: 0})}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: announcementForm.priority === 0 ? '2px solid #6c757d' : '1px solid #ddd',
                      background: announcementForm.priority === 0 ? '#6c757d' : 'white',
                      color: announcementForm.priority === 0 ? 'white' : '#333',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    📌 普通
                  </button>
                  <button
                    onClick={() => setAnnouncementForm({...announcementForm, priority: 1})}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: announcementForm.priority === 1 ? '2px solid #ffc107' : '1px solid #ddd',
                      background: announcementForm.priority === 1 ? '#ffc107' : 'white',
                      color: announcementForm.priority === 1 ? 'white' : '#333',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    ⚡ 重要
                  </button>
                  <button
                    onClick={() => setAnnouncementForm({...announcementForm, priority: 2})}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: announcementForm.priority === 2 ? '2px solid #dc3545' : '1px solid #ddd',
                      background: announcementForm.priority === 2 ? '#dc3545' : 'white',
                      color: announcementForm.priority === 2 ? 'white' : '#333',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    🚨 紧急
                  </button>
                </div>
              </div>
              
              <div className="modal-actions" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                <button 
                  className="cancel-btn" 
                  onClick={() => {
                    setShowAnnouncementModal(false);
                    setAnnouncementForm({ title: '', content: '', priority: 0 });
                  }}
                  style={{
                    padding: '12px 24px',
                    border: '1px solid #ddd',
                    background: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  取消
                </button>
                <button 
                  className="confirm-btn" 
                  onClick={handlePublishAnnouncement}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                  }}
                >
                  📢 立即发布
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;