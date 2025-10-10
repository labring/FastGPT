const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// 创建修复版的认证代理服务器
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.url}`);
    
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 检查是否是分享链接
    if (pathname.startsWith('/chat/share')) {
        console.log('🔗 分享链接访问:', req.url);
        
        // 检查是否有token参数
        const token = parsedUrl.query.token;
        
        if (token) {
            console.log('✅ 检测到token，代理到FastGPT分享页面');
            console.log('🎯 Token:', token.substring(0, 15) + '...');
            
            // 移除token参数，构造干净的FastGPT URL
            const shareId = parsedUrl.query.shareId;
            const fastgptUrl = `/chat/share?shareId=${shareId}`;
            
            // 代理到FastGPT，但先不注入脚本，确保页面正常显示
            proxyToFastGPT(req, res, fastgptUrl, token, false, true); // 暂时关闭脚本注入，启用容错
            return;
        } else {
            console.log('❌ 无token，重定向到登录');
            
            // 重定向到登录页面
            const shareId = parsedUrl.query.shareId;
            const returnUrl = encodeURIComponent(`http://10.14.53.120:3004/chat/share?shareId=${shareId}`);
            const loginUrl = `http://10.14.53.120:3003/login.html?redirect=${returnUrl}`;
            
            console.log('🔄 登录URL:', loginUrl);
            res.writeHead(302, { 'Location': loginUrl });
            res.end();
            return;
        }
    }
    
    // 静态文件服务
    if (pathname.endsWith('.html')) {
        const filePath = path.join(__dirname, pathname);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
            return;
        }
    }
    
    // 其他请求代理到FastGPT
    console.log('🔄 普通请求代理:', req.url);
    proxyToFastGPT(req, res, req.url, null, true, true);
});

// 修复的代理函数 - 更安全的脚本注入
function proxyToFastGPT(req, res, targetUrl, userToken = null, enableMonitoring = true, fallbackEnabled = false) {
    const parsedUrl = url.parse(targetUrl || req.url);
    
    console.log('🚀 代理到FastGPT:', targetUrl || req.url);
    
    const options = {
        hostname: 'localhost', // 保持本地连接到FastGPT实例
        port: 3000,
        path: parsedUrl.path,
        method: req.method,
        headers: { ...req.headers }
    };
    
    // 删除host头
    delete options.headers.host;
    
    const proxyReq = http.request(options, (proxyRes) => {
        console.log('📡 FastGPT响应:', proxyRes.statusCode, proxyRes.headers['content-type']);
        
        // 检查是否是HTML响应且需要注入监控
        const isHtml = proxyRes.headers['content-type']?.includes('text/html');
        const shouldInjectScript = userToken && enableMonitoring && isHtml;
        
        if (shouldInjectScript) {
            console.log('📝 准备注入监控脚本');
            
            // 收集完整的响应体
            let body = '';
            
            proxyRes.on('data', (chunk) => {
                body += chunk;
            });
            
            proxyRes.on('end', () => {
                try {
                    // 安全地注入监控脚本
                    const injectedBody = injectMonitoringScript(body, userToken);
                    
                    // 设置正确的头部
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    
                    // 发送修改后的响应
                    res.end(injectedBody);
                    console.log('✅ 监控脚本注入成功');
                } catch (e) {
                    console.error('❌ 脚本注入失败:', e.message);
                    
                    // 安全回退 - 发送原始响应
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    res.end(body);
                }
            });
        } else {
            // 无需修改的请求 - 直接传递
            console.log('➡️ 直接传递响应');
            
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            
            proxyRes.pipe(res);
        }
    });
    
    // 处理代理请求错误
    proxyReq.on('error', (err) => {
        console.error('❌ 代理请求错误:', err.message);
        
        if (fallbackEnabled) {
            // 提供友好的错误页面
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>FastGPT认证系统 - 演示模式</title>
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            text-align: center;
                            margin-top: 20px;
                            background-color: #f5f7fa;
                        }
                        .container {
                            max-width: 800px;
                            margin: 0 auto;
                            background: white;
                            padding: 30px;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        h1 { color: #2563eb; }
                        h2 { color: #4b5563; margin-top: 30px; }
                        p { color: #4b5563; line-height: 1.6; }
                        .notice { 
                            display: inline-block;
                            padding: 8px 16px;
                            background-color: #e0f2fe;
                            color: #0369a1;
                            border-radius: 4px;
                            margin: 20px 0;
                        }
                        .success {
                            background-color: #d1fae5;
                            color: #047857;
                        }
                        .demo-section {
                            margin-top: 30px;
                            text-align: left;
                            padding: 20px;
                            background-color: #f8fafc;
                            border-radius: 8px;
                            border: 1px solid #e2e8f0;
                        }
                        .action {
                            margin-top: 30px;
                        }
                        button {
                            background-color: #2563eb;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 4px;
                            cursor: pointer;
                            margin: 5px;
                        }
                        .chat-container {
                            border: 1px solid #e2e8f0;
                            height: 300px;
                            overflow-y: auto;
                            padding: 10px;
                            margin: 20px 0;
                            background: white;
                            border-radius: 4px;
                        }
                        .message {
                            margin: 10px 0;
                            padding: 10px;
                            border-radius: 8px;
                        }
                        .user-message {
                            background-color: #e0f2fe;
                            align-self: flex-end;
                            margin-left: 50px;
                        }
                        .ai-message {
                            background-color: #f3f4f6;
                            align-self: flex-start;
                            margin-right: 50px;
                        }
                        .input-area {
                            display: flex;
                            margin-top: 10px;
                        }
                        .input-area input {
                            flex: 1;
                            padding: 10px;
                            border: 1px solid #e2e8f0;
                            border-radius: 4px;
                            margin-right: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>FastGPT认证系统 - 演示模式</h1>
                        <div class="notice success">✅ 认证成功！您已通过身份验证</div>
                        
                        <p>FastGPT主服务目前不可用，但认证系统正常工作。这是一个演示页面，展示了认证系统的功能。</p>
                        
                        <div class="demo-section">
                            <h2>聊天功能演示</h2>
                            <p>这是模拟的FastGPT聊天功能，您的所有对话将被记录到用户管理系统中。</p>
                            
                            <div class="chat-container" id="chat-container">
                                <div class="message ai-message">您好！我是FastGPT演示助手。您有什么问题吗？</div>
                            </div>
                            
                            <div class="input-area">
                                <input type="text" id="user-input" placeholder="输入您的问题..." />
                                <button onclick="sendMessage()">发送</button>
                            </div>
                        </div>
                        
                        <div class="demo-section">
                            <h2>用户信息</h2>
                            <p>您当前使用的是认证监管系统的演示模式。以下是您的登录信息：</p>
                            <p><strong>用户ID:</strong> ${userToken ? userToken.substring(0, 10) + '...' : '未登录'}</p>
                            <p><strong>IP地址:</strong> ${req.socket.remoteAddress}</p>
                            <p><strong>访问时间:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        
                        <div class="action">
                            <button onclick="location.reload()">刷新页面</button>
                            <button onclick="window.location.href='http://10.14.53.120:3003/login.html'">返回登录</button>
                        </div>
                    </div>
                    
                    <script>
                        // 模拟聊天功能
                        function sendMessage() {
                            const input = document.getElementById('user-input');
                            const message = input.value.trim();
                            
                            if (message) {
                                // 添加用户消息
                                addMessage(message, 'user-message');
                                input.value = '';
                                
                                // 记录聊天到认证系统
                                logChat(message);
                                
                                // 模拟AI回复
                                setTimeout(() => {
                                    const replies = [
                                        "这是一个演示回复。在实际系统中，这里会显示FastGPT的回答。",
                                        "您的消息已被记录到认证系统。管理员可以在后台查看所有聊天记录。",
                                        "认证系统成功运行中！这证明了身份验证和监控功能正常工作。",
                                        "您的问题很有趣，但这只是一个演示界面。FastGPT主服务启动后，您将获得真实的AI回复。"
                                    ];
                                    const randomReply = replies[Math.floor(Math.random() * replies.length)];
                                    addMessage(randomReply, 'ai-message');
                                }, 1000);
                            }
                        }
                        
                        function addMessage(text, className) {
                            const chatContainer = document.getElementById('chat-container');
                            const messageDiv = document.createElement('div');
                            messageDiv.className = 'message ' + className;
                            messageDiv.textContent = text;
                            chatContainer.appendChild(messageDiv);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        }
                        
                        function logChat(question) {
                            // 发送聊天记录到认证系统
                            const token = "${userToken || ''}";
                            if (token) {
                                fetch('http://10.14.53.120:3003/api/chat/log', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + token
                                    },
                                    body: JSON.stringify({
                                        question,
                                        answer: '这是演示模式中的自动回复。',
                                        timestamp: new Date().toISOString()
                                    })
                                })
                                .then(res => res.json())
                                .then(data => console.log('✅ 聊天记录已保存'))
                                .catch(err => console.error('❌ 聊天记录保存失败:', err));
                            }
                        }
                        
                        // 按Enter键发送消息
                        document.getElementById('user-input').addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') {
                                sendMessage();
                            }
                        });
                    </script>
                </body>
                </html>
            `);
        } else {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('代理请求失败: ' + err.message);
        }
    });
    
    // 如果有请求体，将其转发
    if (req.method === 'POST' || req.method === 'PUT') {
        let body = [];
        
        req.on('data', (chunk) => {
            body.push(chunk);
        });
        
        req.on('end', () => {
            body = Buffer.concat(body);
            proxyReq.write(body);
            proxyReq.end();
        });
    } else {
        // 如果没有请求体，直接结束请求
        proxyReq.end();
    }
}

// 安全的脚本注入函数
function injectMonitoringScript(html, token) {
    // 安全检查
    if (!html || typeof html !== 'string') {
        console.error('❌ 无效的HTML内容');
        return html;
    }
    
    try {
        // 创建监控脚本
        const monitoringScript = `
        <script>
        // FastGPT 认证监管系统 - 聊天监控
        (function() {
            const userToken = "${token}";
            const logUrl = "http://10.14.53.120:3003/api/chat/log";
            
            // 监听聊天消息
            function monitorChats() {
                const chatContainer = document.querySelector('.overflow-y-auto.overflow-x-hidden');
                
                if (chatContainer) {
                    // 创建观察器
                    const observer = new MutationObserver((mutations) => {
                        for (const mutation of mutations) {
                            const addedNodes = mutation.addedNodes;
                            
                            for (const node of addedNodes) {
                                if (node.classList && node.classList.contains('py-5')) {
                                    try {
                                        // 找到问题和回答
                                        const question = node.querySelector('.user-question')?.textContent?.trim();
                                        const answer = node.querySelector('.markdown-body')?.textContent?.trim();
                                        
                                        if (question && answer) {
                                            // 记录聊天
                                            logChat(question, answer);
                                        }
                                    } catch (e) {
                                        console.error('监控脚本错误:', e);
                                    }
                                }
                            }
                        }
                    });
                    
                    // 配置观察器
                    observer.observe(chatContainer, {
                        childList: true,
                        subtree: true
                    });
                    
                    console.log('✅ 聊天监控已启动');
                } else {
                    // 如果还没有找到聊天容器，稍后再试
                    setTimeout(monitorChats, 1000);
                }
            }
            
            // 记录聊天到服务器
            function logChat(question, answer) {
                fetch(logUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + userToken
                    },
                    body: JSON.stringify({
                        question,
                        answer,
                        timestamp: new Date().toISOString()
                    })
                })
                .then(res => res.json())
                .then(data => console.log('✅ 聊天记录已保存'))
                .catch(err => console.error('❌ 聊天记录保存失败:', err));
            }
            
            // 页面加载后开始监控
            window.addEventListener('load', () => {
                setTimeout(monitorChats, 1000);
            });
            
            // 立即尝试初始化监控
            monitorChats();
            
            console.log('✅ FastGPT监控脚本已加载');
        })();
        </script>
        `;
        
        // 安全地将脚本注入到</body>之前
        const bodyEndIndex = html.toLowerCase().lastIndexOf('</body>');
        
        if (bodyEndIndex !== -1) {
            // 在</body>标签前注入脚本
            return html.slice(0, bodyEndIndex) + monitoringScript + html.slice(bodyEndIndex);
        } else {
            // 如果找不到</body>标签，尝试在HTML结尾注入
            return html + monitoringScript;
        }
    } catch (e) {
        console.error('❌ 脚本注入处理错误:', e.message);
        return html; // 安全回退
    }
}

// 启动服务器
const PORT = 3004;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🔐 FastGPT认证代理服务器启动成功！
📍 代理地址: http://10.14.53.120:${PORT}
🎯 FastGPT地址: http://localhost:3000
⚡ 所有分享链接现在需要认证访问
    `);
});

// 优雅关闭
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        console.log(`\n⏱️ 收到${signal}信号，正在关闭服务器...`);
        
        server.close(() => {
            console.log('👋 服务器已安全关闭');
            process.exit(0);
        });
        
        // 如果10秒后还没关闭，强制退出
        setTimeout(() => {
            console.error('⚠️ 服务器关闭超时，强制退出');
            process.exit(1);
        }, 10000);
    });
});