# 启动FastGPT与认证监管系统的整合脚本

Write-Host "正在启动FastGPT与认证监管系统..." -ForegroundColor Green

# 关闭可能已经在运行的Node.js进程
Write-Host "关闭现有Node.js进程..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

# 等待进程完全关闭
Start-Sleep -Seconds 2

# 启动认证用户管理服务
Write-Host "启动用户管理服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node simple-server.js"
Write-Host "用户管理服务启动在: http://10.14.53.120:3003" -ForegroundColor Green

# 等待用户管理服务完全启动
Start-Sleep -Seconds 3

# 启动认证代理服务
Write-Host "启动认证代理服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node fixed-proxy.js"
Write-Host "认证代理服务启动在: http://10.14.53.120:3004" -ForegroundColor Green

# 等待认证代理服务完全启动
Start-Sleep -Seconds 3

# 启动FastGPT服务
Write-Host "启动FastGPT主服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\projects\app; npx next dev -H 10.14.53.120 -p 3000"
Write-Host "FastGPT主服务启动在: http://10.14.53.120:3000" -ForegroundColor Green

Write-Host "`n所有服务已启动完成！" -ForegroundColor Magenta
Write-Host "`n使用说明:" -ForegroundColor Yellow
Write-Host "1. 访问FastGPT: http://10.14.53.120:3000" -ForegroundColor White
Write-Host "2. 创建应用并获取分享链接" -ForegroundColor White
Write-Host "3. 将分享链接从 http://10.14.53.120:3000/chat/share?shareId=xxx" -ForegroundColor White
Write-Host "   修改为: http://10.14.53.120:3004/chat/share?shareId=xxx" -ForegroundColor White
Write-Host "4. 通过修改后的链接访问，将需要先登录才能查看内容" -ForegroundColor White
Write-Host "5. 管理员页面: http://10.14.53.120:3003/admin (用户名: admin 密码: 123456)" -ForegroundColor White