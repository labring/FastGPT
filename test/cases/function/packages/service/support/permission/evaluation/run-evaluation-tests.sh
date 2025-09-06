#!/bin/bash

# 评估权限功能测试运行脚本
# 使用方法: ./test/cases/function/packages/service/support/permission/evaluation/run-evaluation-tests.sh

set -e

echo "🚀 开始运行评估权限功能测试..."

# 检查环境配置
ENV_FILE="test/cases/function/packages/service/support/permission/evaluation/.env"
ENV_EXAMPLE="test/cases/function/packages/service/support/permission/evaluation/.env.example"

if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  未找到环境配置文件，正在创建..."
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        echo "📝 已创建 $ENV_FILE，请编辑此文件并填入正确的配置值"
        echo "💡 配置说明:"
        echo "   - FASTGPT_BASE_URL: FastGPT服务地址"
        echo "   - TEST_TOKEN: 测试用户令牌 (从浏览器开发者工具获取)"
        echo ""
        echo "⏸️  请配置环境变量后重新运行此脚本"
        exit 1
    else
        echo "❌ 未找到环境配置示例文件"
        exit 1
    fi
fi

# 加载环境变量
set -a
source "$ENV_FILE"
set +a

# 检查必需的环境变量
if [ -z "$TEST_TOKEN" ]; then
    echo "❌ 必须配置 TEST_TOKEN 环境变量"
    echo "💡 提示: 可以在浏览器开发者工具中获取 Authorization header 的值"
    exit 1
fi

if [ -z "$FASTGPT_BASE_URL" ]; then
    echo "⚠️  未配置 FASTGPT_BASE_URL，使用默认值: http://localhost:3000"
    export FASTGPT_BASE_URL="http://localhost:3000"
fi

echo "🔧 测试配置:"
echo "   服务地址: $FASTGPT_BASE_URL"
echo "   认证令牌: ${TEST_TOKEN:0:20}..."

# 检查FastGPT服务是否可用
echo ""
echo "🔍 检查FastGPT服务可用性..."
if curl -s --max-time 10 "$FASTGPT_BASE_URL/api/health" > /dev/null 2>&1; then
    echo "✅ FastGPT服务可访问"
else
    echo "⚠️  无法访问FastGPT服务，测试可能会失败"
    echo "   请确保服务正在运行并且地址配置正确"
fi

echo ""
echo "🧪 运行基础功能测试..."

# 运行简化测试
if pnpm test test/cases/function/packages/service/support/permission/evaluation/evaluation-permissions-simple.test.ts; then
    echo "✅ 基础功能测试通过"
    TEST_BASIC_PASSED=1
else
    echo "❌ 基础功能测试失败"
    TEST_BASIC_PASSED=0
fi

echo ""
echo "🧪 运行完整功能测试..."

# 运行完整测试（如果配置了更多环境变量）
if [ -n "$OWNER_TOKEN" ] && [ -n "$MEMBER_TOKEN" ]; then
    echo "📊 检测到多用户配置，运行完整权限测试..."
    if pnpm test test/cases/function/packages/service/support/permission/evaluation/evaluation-permissions.test.ts; then
        echo "✅ 完整功能测试通过"
        TEST_FULL_PASSED=1
    else
        echo "❌ 完整功能测试失败"
        TEST_FULL_PASSED=0
    fi
else
    echo "⚠️  未配置多用户环境变量，跳过完整测试"
    echo "💡 提示: 配置 OWNER_TOKEN、MEMBER_TOKEN 等可运行更全面的权限测试"
    TEST_FULL_PASSED=-1
fi

echo ""
echo "📊 测试结果汇总:"
echo "=================="

if [ $TEST_BASIC_PASSED -eq 1 ]; then
    echo "✅ 基础功能测试: 通过"
else
    echo "❌ 基础功能测试: 失败"
fi

if [ $TEST_FULL_PASSED -eq 1 ]; then
    echo "✅ 完整功能测试: 通过"
elif [ $TEST_FULL_PASSED -eq 0 ]; then
    echo "❌ 完整功能测试: 失败"
else
    echo "⏸️  完整功能测试: 跳过"
fi

echo ""
if [ $TEST_BASIC_PASSED -eq 1 ]; then
    echo "🎉 评估权限功能测试完成！权限系统工作正常。"
    exit 0
else
    echo "💥 测试失败！请检查:"
    echo "   1. FastGPT服务是否正常运行"
    echo "   2. 环境配置是否正确"
    echo "   3. 用户令牌是否有效"
    echo "   4. 网络连接是否正常"
    exit 1
fi