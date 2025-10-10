const express = require('express');
const path = require('path');

const app = express();
const PORT = 3003;

// 中间件
app.use(express.json());
app.use(express.static(__dirname));

// JWT Token 认证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: '访问被拒绝，缺少认证令牌' });
    }

    // 简单的token验证（实际项目中应使用JWT库）
    if (token.startsWith('fake-jwt-token-')) {
        const userId = parseInt(token.replace('fake-jwt-token-', ''));
        const user = users.find(u => u.id === userId);
        
        if (user) {
            req.user = user;
            next();
        } else {
            return res.status(403).json({ message: '无效的认证令牌' });
        }
    } else {
        return res.status(403).json({ message: '无效的认证令牌格式' });
    }
}

// 模拟用户数据（实际项目中应该连接数据库）
let users = [
    { id: 1, username: 'admin', email: 'admin@test.com', password: '123456', role: 'admin' },
    { id: 2, username: 'user1', email: 'user1@test.com', password: '123456', role: 'user' }
];

let chatLogs = [
    { 
        id: 1, 
        userId: 1, 
        username: 'admin', 
        email: 'admin@test.com',
        question: '什么是人工智能？', 
        answer: '人工智能是计算机科学的一个分支...', 
        timestamp: new Date('2024-10-01 10:00:00'),
        ip: '192.168.1.100'
    },
    { 
        id: 2, 
        userId: 2, 
        username: 'user1', 
        email: 'user1@test.com',
        question: 'FastGPT 怎么使用？', 
        answer: 'FastGPT 是一个开源的对话AI平台...', 
        timestamp: new Date('2024-10-01 14:30:00'),
        ip: '192.168.1.101'
    }
];

// 用户注册接口
app.post('/api/user/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ message: '所有字段都是必填的' });
    }
    
    // 检查用户是否已存在
    const existingUser = users.find(u => u.email === email || u.username === username);
    if (existingUser) {
        return res.status(400).json({ message: '用户名或邮箱已存在' });
    }
    
    // 创建新用户
    const newUser = {
        id: users.length + 1,
        username,
        email,
        password, // 实际项目中应该加密
        role: 'user',
        createdAt: new Date()
    };
    
    users.push(newUser);
    
    res.status(201).json({
        message: '注册成功',
        token: 'fake-jwt-token-' + newUser.id,
        user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role
        }
    });
});

// 用户登录接口
app.post('/api/user/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ message: '用户名和密码都是必填的' });
    }
    
    // 查找用户
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.status(401).json({ message: '用户名或密码不正确' });
    }
    
    res.status(200).json({
        message: '登录成功',
        token: 'fake-jwt-token-' + user.id,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        }
    });
});

// Token验证接口
app.post('/api/user/verify', (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ message: '缺少token' });
    }
    
    // 验证token
    if (token.startsWith('fake-jwt-token-')) {
        const userId = parseInt(token.replace('fake-jwt-token-', ''));
        const user = users.find(u => u.id === userId);
        
        if (user) {
            return res.status(200).json({
                valid: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            });
        }
    }
    
    res.status(200).json({
        valid: false,
        message: '无效的token'
    });
});

// 获取用户列表接口 (管理员)
app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: '权限不足' });
    }
    
    // 不返回密码
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);
    
    res.status(200).json(usersWithoutPasswords);
});

// 记录聊天日志接口
app.post('/api/chat/log', authenticateToken, (req, res) => {
    const { question, answer } = req.body;
    
    if (!question || !answer) {
        return res.status(400).json({ message: '问题和回答都是必填的' });
    }
    
    const newChatLog = {
        id: chatLogs.length + 1,
        userId: req.user.id,
        username: req.user.username,
        email: req.user.email,
        question,
        answer,
        timestamp: new Date(),
        ip: req.ip || req.connection.remoteAddress
    };
    
    chatLogs.push(newChatLog);
    
    res.status(201).json({
        message: '聊天记录保存成功',
        logId: newChatLog.id
    });
});

// 查询聊天记录接口 (管理员)
app.get('/api/chat/logs', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: '权限不足' });
    }
    
    res.status(200).json(chatLogs);
});

// 提供登录页面
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 根路径重定向到登录页面
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// 提供管理页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 用户管理系统启动成功！
📍 服务地址: http://10.14.53.120:${PORT}
🔐 默认管理员: admin / 123456
📊 API文档: http://10.14.53.120:${PORT}/api
    `);
});