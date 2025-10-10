# 启动FastGPT与认证监管系统的脚本

Write-Host "正在配置并启动FastGPT与认证监管系统..." -ForegroundColor Green

# 创建必要的目录
Write-Host "检查并创建目录结构..." -ForegroundColor Cyan
if (-not (Test-Path -Path "C:\Users\Admin\Desktop\FastGPT\projects\app\src\auth-proxy")) {
    New-Item -Path "C:\Users\Admin\Desktop\FastGPT\projects\app\src\auth-proxy" -ItemType Directory -Force
}

# 构建FastGPT应用
Write-Host "开始构建FastGPT应用..." -ForegroundColor Cyan
cd C:\Users\Admin\Desktop\FastGPT\projects\app
pnpm build

# 如果构建成功，则启动所有服务
if ($LASTEXITCODE -eq 0) {
    Write-Host "FastGPT构建成功！正在启动所有服务..." -ForegroundColor Green

    # 启动用户管理服务（在新窗口中）
    Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node simple-server.js"
    Write-Host "用户管理服务启动在端口3003" -ForegroundColor Cyan

    # 启动认证代理服务（在新窗口中）
    Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node fixed-proxy.js"
    Write-Host "认证代理服务启动在端口3004" -ForegroundColor Cyan

    # 启动FastGPT主服务（在新窗口中）
    Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\projects\app; npx next dev -H 10.14.53.120 -p 3000"
    Write-Host "FastGPT主服务启动在端口3000" -ForegroundColor Cyan

    Write-Host "`n所有服务已启动！" -ForegroundColor Green
    Write-Host "- FastGPT主服务: http://10.14.53.120:3000" -ForegroundColor Yellow
    Write-Host "- 用户管理服务: http://10.14.53.120:3003" -ForegroundColor Yellow
    Write-Host "- 认证代理服务: http://10.14.53.120:3004" -ForegroundColor Yellow
    Write-Host "`n访问管理后台: http://10.14.53.120:3003/login.html" -ForegroundColor Yellow
    Write-Host "默认管理员账号: admin / 123456" -ForegroundColor Yellow
} else {
    Write-Host "构建失败，请检查错误信息" -ForegroundColor Red
}