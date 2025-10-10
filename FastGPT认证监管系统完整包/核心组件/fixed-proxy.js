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
            proxyToFastGPT(req, res, fastgptUrl, token, false); // 暂时关闭脚本注入
            return;
        } else {
            console.log('❌ 无token，重定向到登录');
            
            // 重定向到登录页面
            const shareId = parsedUrl.query.shareId;
            const returnUrl = encodeURIComponent(`http://localhost:3001/chat/share?shareId=${shareId}`);
            const loginUrl = `http://localhost:3002/login.html?redirect=${returnUrl}`;
            
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
    proxyToFastGPT(req, res, req.url);
});

// 修复的代理函数 - 更安全的脚本注入
function proxyToFastGPT(req, res, targetUrl, userToken = null, enableMonitoring = true) {
    const parsedUrl = url.parse(targetUrl || req.url);
    
    console.log('🚀 代理到FastGPT:', targetUrl || req.url);
    
    const options = {
        hostname: 'localhost',
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
            let body = [];
            let totalLength = 0;
            
            proxyRes.on('data', chunk => {
                body.push(chunk);
                totalLength += chunk.length;
            });
            
            proxyRes.on('end', () => {
                try {
                    // 合并所有chunk
                    const fullBody = Buffer.concat(body, totalLength);
                    let htmlContent = fullBody.toString('utf8');
                    
                    console.log('📄 HTML内容长度:', htmlContent.length);
                    
                    // 简单而安全的脚本注入
                    const monitorScript = `
<!-- FastGPT认证代理监控脚本 -->
<script>
(function() {
    console.log('🎯 FastGPT分享页面监控已激活');
    
    // 显示认证成功提示
    function showAuthBanner() {
        const banner = document.createElement('div');
        banner.id = 'fastgpt-auth-banner';
        banner.style.cssText = \`
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(45deg, #28a745, #20c997);
            color: white;
            text-align: center;
            padding: 12px;
            font-size: 14px;
            z-index: 99999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        \`;
        banner.innerHTML = '🎯 分享页面认证成功 - 聊天监控已激活 (3秒后自动隐藏)';
        
        document.body.appendChild(banner);
        
        // 3秒后隐藏
        setTimeout(() => {
            banner.style.transform = 'translateY(-100%)';
            banner.style.transition = 'transform 0.5s ease';
            setTimeout(() => banner.remove(), 500);
        }, 3000);
    }
    
    // 监控聊天API调用
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const result = originalFetch.apply(this, args);
        
        if (args[0] && args[0].includes('/api/') && args[1] && args[1].method === 'POST') {
            result.then(response => {
                if (response.ok && (args[0].includes('chat') || args[0].includes('conversation'))) {
                    console.log('💬 检测到聊天API调用:', args[0]);
                    
                    let messageContent = '用户进行了聊天交互';
                    try {
                        if (args[1] && args[1].body) {
                            const bodyData = JSON.parse(args[1].body);
                            if (bodyData.messages && bodyData.messages.length > 0) {
                                const lastMessage = bodyData.messages[bodyData.messages.length - 1];
                                messageContent = lastMessage.content || messageContent;
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                    
                    const chatData = {
                        shareId: new URLSearchParams(window.location.search).get('shareId'),
                        message: messageContent.substring(0, 500), // 限制长度
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent.substring(0, 100)
                    };
                    
                    fetch('http://localhost:3002/api/chat/log', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ${userToken}'
                        },
                        body: JSON.stringify(chatData)
                    }).then(logRes => {
                        if (logRes.ok) {
                            console.log('✅ 聊天记录成功');
                        } else {
                            console.log('❌ 聊天记录失败:', logRes.status);
                        }
                    }).catch(err => {
                        console.log('❌ 聊天记录网络错误:', err.message);
                    });
                }
            }).catch(err => console.log('监控错误:', err));
        }
        
        return result;
    };
    
    // 页面加载完成后显示横幅
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showAuthBanner);
    } else {
        showAuthBanner();
    }
})();
</script>
                    `;
                    
                    // 查找合适的注入点 - 在</head>前注入
                    if (htmlContent.includes('</head>')) {
                        htmlContent = htmlContent.replace('</head>', monitorScript + '\n</head>');
                        console.log('✅ 脚本已注入到<head>');
                    } else if (htmlContent.includes('</body>')) {
                        htmlContent = htmlContent.replace('</body>', monitorScript + '\n</body>');
                        console.log('✅ 脚本已注入到<body>');
                    } else {
                        htmlContent += monitorScript;
                        console.log('✅ 脚本已追加到HTML末尾');
                    }
                    
                    // 设置响应头
                    res.writeHead(proxyRes.statusCode, {
                        ...proxyRes.headers,
                        'content-length': Buffer.byteLength(htmlContent, 'utf8')
                    });
                    
                    res.end(htmlContent);
                    console.log('📝 监控脚本注入完成，页面已发送');
                    
                } catch (error) {
                    console.error('❌ 脚本注入失败:', error.message);
                    // 如果注入失败，直接转发原始内容
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    res.end(Buffer.concat(body));
                }
            });
        } else {
            // 直接转发，不注入脚本
            console.log('🔄 直接转发响应');
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        }
    });
    
    proxyReq.on('error', (err) => {
        console.error('❌ 代理错误:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '代理服务器错误: ' + err.message }));
    });
    
    // 转发请求体
    req.pipe(proxyReq);
}

// 启动服务器
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`
🚀 修复版认证代理服务器启动成功！
📍 端口: ${PORT}
🔗 测试链接: http://localhost:${PORT}/chat/share?shareId=oYfBSqaBp7hHyHNC9Ehp684s

📋 修复内容:
1. 更安全的脚本注入逻辑
2. 完整的HTML内容处理
3. 错误处理和回退机制
4. 详细的调试日志

⚠️  请确保用户管理系统(端口3002)和FastGPT(端口3000)都在运行
    `);
});
