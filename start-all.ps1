# 启动所有服务的PowerShell脚本

Write-Host "正在启动FastGPT及认证监管系统..." -ForegroundColor Green

# 启动用户管理服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node simple-server.js"
Write-Host "用户管理服务启动在端口3003" -ForegroundColor Cyan

# 启动认证代理服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node fixed-proxy.js"
Write-Host "认证代理服务启动在端口3004" -ForegroundColor Cyan

# 启动FastGPT主服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\projects\app; npx next dev -H 10.14.53.120 -p 3000"
Write-Host "FastGPT主服务启动在端口3000" -ForegroundColor Cyan

Write-Host "`n所有服务已启动！" -ForegroundColor Green
Write-Host "- FastGPT主服务: http://10.14.53.120:3000" -ForegroundColor Yellow
Write-Host "- 用户管理服务: http://10.14.53.120:3003" -ForegroundColor Yellow
Write-Host "- 认证代理服务: http://10.14.53.120:3004" -ForegroundColor Yellow