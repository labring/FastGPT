# 停止所有FastGPT相关服务的脚本

Write-Host "正在停止FastGPT及认证监管系统..." -ForegroundColor Yellow

# 停止Node.js进程（认证系统和FastGPT）
Get-Process | Where-Object { $_.ProcessName -eq "node" } | ForEach-Object {
    Write-Host "正在停止进程: $($_.Id)" -ForegroundColor Cyan
    Stop-Process -Id $_.Id -Force
}

Write-Host "`n所有服务已停止！" -ForegroundColor Green