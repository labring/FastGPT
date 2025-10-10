const express = require('express');
const path = require('path');

const app = express();
const PORT = 3002;

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
    
    console.log(`✅ 新用户注册: ${username} (${email})`);
});

// 用户登录接口
app.post('/api/user/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ message: '邮箱和密码都是必填的' });
    }
    
    // 查找用户
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ message: '邮箱或密码错误' });
    }
    
    res.json({
        message: '登录成功',
        token: 'fake-jwt-token-' + user.id,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        }
    });
    
    console.log(`✅ 用户登录: ${user.username} (${user.email})`);
});

// 验证用户token接口（分享页面用）
app.post('/api/user/verify', authenticateToken, (req, res) => {
    // 如果通过了authenticateToken中间件，说明token有效
    res.json({
        success: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// 记录聊天日志接口（支持分享链接认证）
app.post('/api/chat/log', authenticateToken, (req, res) => {
    const { question, answer, shareId, appName, source, message } = req.body;
    const user = req.user; // 从token中获取用户信息
    
    const chatLog = {
        id: chatLogs.length + 1,
        userId: user.id,
        username: user.username,
        email: user.email,
        question: question || message || '用户进行了聊天交互',
        answer: answer || '', // 分享链接时可能先记录问题，后更新答案
        shareId: shareId || null,
        appName: appName || 'FastGPT',
        source: source || 'share', // direct, share等
        timestamp: new Date(),
        ip: req.ip || req.connection.remoteAddress || '127.0.0.1'
    };
    
    chatLogs.push(chatLog);
    
    res.json({ 
        success: true, 
        message: '聊天记录已保存',
        recordId: chatLog.id
    });
    
    console.log(`📝 聊天记录: ${chatLog.username} [${source || 'share'}] - ${chatLog.question.substring(0, 50)}...`);
});

// 更新聊天记录的回答（分享链接专用）
app.post('/api/chat/update', authenticateToken, (req, res) => {
    const { question, answer, shareId } = req.body;
    const user = req.user;
    
    // 找到最近的匹配记录
    const recordIndex = chatLogs.findIndex(log => 
        log.username === user.username && 
        log.question === question &&
        log.shareId === shareId &&
        log.answer === '' // 找到还没有回答的记录
    );
    
    if (recordIndex !== -1) {
        chatLogs[recordIndex].answer = answer;
        chatLogs[recordIndex].updatedAt = new Date();
        res.json({ success: true, message: '聊天记录已更新' });
        console.log(`✅ 更新聊天回答: ${user.username} - ${question.substring(0, 30)}...`);
    } else {
        // 如果找不到记录，创建新的完整记录
        const chatLog = {
            id: chatLogs.length + 1,
            userId: user.id,
            username: user.username,
            email: user.email,
            question,
            answer,
            shareId: shareId || null,
            appName: 'FastGPT分享',
            source: 'share',
            timestamp: new Date(),
            updatedAt: new Date(),
            ip: req.ip || req.connection.remoteAddress || '127.0.0.1'
        };
        
        chatLogs.push(chatLog);
        res.json({ success: true, message: '聊天记录已创建' });
        console.log(`📝 新建聊天记录: ${user.username} [share] - ${question.substring(0, 50)}...`);
    }
});

// 获取聊天记录接口（支持分享链接过滤）
app.get('/api/chat/logs', (req, res) => {
    const { page = 1, limit = 20, shareId, username, source } = req.query;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    
    let filteredLogs = chatLogs;
    
    // 根据查询参数过滤
    if (shareId) {
        filteredLogs = filteredLogs.filter(log => log.shareId === shareId);
    }
    if (username) {
        filteredLogs = filteredLogs.filter(log => log.username.includes(username));
    }
    if (source) {
        filteredLogs = filteredLogs.filter(log => log.source === source);
    }
    
    const paginatedLogs = filteredLogs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(startIndex, endIndex);
    
    res.json({
        logs: paginatedLogs,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: filteredLogs.length,
            pages: Math.ceil(filteredLogs.length / limit)
        }
    });
});

// 获取用户列表接口
app.get('/api/users', (req, res) => {
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ users: safeUsers });
});

// 静态文件路由
app.get('/', (req, res) => {
    const { redirect } = req.query;
    
    if (redirect) {
        // 如果有重定向参数，显示登录页面并传递重定向信息
        res.sendFile(path.join(__dirname, 'login.html'));
    } else {
        // 否则显示默认登录页面
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

// 认证成功后的重定向处理
app.get('/auth-callback', (req, res) => {
    const { token, redirect } = req.query;
    
    if (token && redirect) {
        // 重定向到认证代理的回调接口
        const callbackUrl = `http://localhost:3001/auth-success?token=${token}&redirect=${redirect}`;
        res.redirect(callbackUrl);
    } else {
        res.status(400).send('缺少必要参数');
    }
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'user_register.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 用户管理服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 登录页面: http://localhost:${PORT}`);
    console.log(`📋 注册页面: http://localhost:${PORT}/register`);
    console.log(`📊 管理面板: http://localhost:${PORT}/admin`);
    console.log('');
    console.log('🎯 这个系统的作用：');
    console.log('  1. 用户注册和登录管理');
    console.log('  2. 记录用户的聊天日志');
    console.log('  3. 管理员可以查看"谁问了什么问题"');
    console.log('  4. 可以导出聊天记录进行分析');
    console.log('');
    console.log('📋 API 接口：');
    console.log('  POST /api/user/register - 用户注册');
    console.log('  POST /api/user/login - 用户登录');
    console.log('  POST /api/chat/log - 记录聊天日志');
    console.log('  GET  /api/chat/logs - 获取聊天记录');
    console.log('  GET  /api/users - 获取用户列表');
    console.log('');
    console.log('现在你可以：');
    console.log('1. 访问 http://localhost:3002 进行登录');
    console.log('2. 访问 http://localhost:3002/register 注册新用户');
    console.log('3. 访问 http://localhost:3002/admin 查看管理面板');
});
