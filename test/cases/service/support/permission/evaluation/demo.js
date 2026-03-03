#!/usr/bin/env node

/**
 * FastGPT 评估权限智能测试脚本
 *
 * 自动检测token类型并使用正确的认证方式
 * 运行方式: node test/cases/function/packages/service/support/permission/evaluation/smart-demo.js
 */

const fs = require('fs');
const path = require('path');

// 加载.env文件
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');

  if (fs.existsSync(envPath)) {
    console.log('📂 正在加载环境配置文件...');
    const envContent = fs.readFileSync(envPath, 'utf8');

    envContent.split('\n').forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split('=', 2);
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });

    console.log('✅ 环境配置已加载\n');
  }
}

// 检测token类型
function detectTokenType(token) {
  if (!token) return 'none';

  if (token.startsWith('fastgpt-')) {
    return 'apikey';
  } else if (token.startsWith('eyJ')) {
    return 'jwt';
  } else if (token.length > 50) {
    return 'session';
  } else {
    return 'unknown';
  }
}

// 创建认证headers
function createAuthHeaders(token, tokenType) {
  const headers = {
    'Content-Type': 'application/json'
  };

  switch (tokenType) {
    case 'apikey':
      headers['Authorization'] = `Bearer ${token}`;
      break;
    case 'jwt':
    case 'session':
      headers['token'] = token;
      break;
    case 'cookie':
      headers['Cookie'] = `token=${token}`;
      break;
  }

  return headers;
}

// 测试API调用
async function testApiCall(url, token, tokenType, testName) {
  const headers = createAuthHeaders(token, tokenType);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageNum: 1, pageSize: 5 }),
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const data = await response.json();
      const itemCount = data.data?.list?.length || 0;
      const totalCount = data.data?.total || 0;
      console.log(`✅ ${testName}: 成功 (${itemCount}/${totalCount} 项可访问)`);
      console.log(data);
      if (data.data?.list && data.data.list.length > 0 && data.data.list[0].permission) {
        console.log(
          `   权限信息: 读${data.data.list[0].permission.hasReadPer} 写${data.data.list[0].permission.hasWritePer} 管理${data.data.list[0].permission.hasManagePer}`
        );
      }
      return { success: true, data };
    } else {
      const errorText = await response.text();
      console.log(`❌ ${testName}: HTTP ${response.status}`);
      console.log(`   错误详情: ${errorText}`);
      return { success: false, status: response.status, error: errorText };
    }
  } catch (error) {
    console.log(`❌ ${testName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 主测试函数
async function smartTest() {
  console.log('🚀 FastGPT 评估权限智能测试\n');

  loadEnvFile();

  const API_BASE = process.env.FASTGPT_BASE_URL || 'http://localhost:3000';
  const TEST_TOKEN = process.env.TEST_TOKEN || '';

  if (!TEST_TOKEN) {
    console.log('❌ 错误: 未配置TEST_TOKEN环境变量');
    console.log(
      '💡 请查看 test/cases/function/packages/service/support/permission/evaluation/get-token-guide.md 了解如何获取token\n'
    );
    process.exit(1);
  }

  const tokenType = detectTokenType(TEST_TOKEN);

  console.log('🔧 测试配置:');
  console.log(`   服务地址: ${API_BASE}`);
  console.log(`   Token长度: ${TEST_TOKEN.length} 字符`);
  console.log(`   Token类型: ${tokenType}`);
  console.log(`   Token预览: ${TEST_TOKEN.substring(0, 20)}...`);
  console.log();

  if (tokenType === 'unknown') {
    console.log('⚠️  警告: 无法识别的token格式');
    console.log(
      '💡 建议查看 test/cases/function/packages/service/support/permission/evaluation/get-token-guide.md 获取正确的token\n'
    );
  }

  // 测试不同的认证方式
  console.log('🔍 开始权限测试...\n');

  const apiEndpoints = [
    { name: '评估任务', path: '/api/core/evaluation/task/list' },
    { name: '评估数据集', path: '/api/core/evaluation/dataset/collection/list' },
    { name: '评估指标', path: '/api/core/evaluation/metric/list' }
  ];

  let successCount = 0;
  const results = [];

  // 首先尝试检测到的token类型
  console.log(`📋 使用${tokenType}认证方式测试...\n`);

  for (const endpoint of apiEndpoints) {
    const result = await testApiCall(
      `${API_BASE}${endpoint.path}`,
      TEST_TOKEN,
      tokenType,
      endpoint.name
    );

    results.push({ ...endpoint, result, authType: tokenType });
    if (result.success) successCount++;
  }

  // 如果主要认证方式失败，尝试其他方式
  if (successCount === 0) {
    console.log('\n🔄 尝试其他认证方式...\n');

    const alternativeTypes = ['jwt', 'session', 'apikey', 'cookie'].filter((t) => t !== tokenType);

    for (const altType of alternativeTypes) {
      console.log(`📋 尝试${altType}认证方式...\n`);

      let altSuccessCount = 0;
      for (const endpoint of apiEndpoints) {
        const result = await testApiCall(
          `${API_BASE}${endpoint.path}`,
          TEST_TOKEN,
          altType,
          endpoint.name
        );

        if (result.success) {
          altSuccessCount++;
          console.log(`✨ 发现可用的认证方式: ${altType}\n`);
          break;
        }
      }

      if (altSuccessCount > 0) {
        successCount = altSuccessCount;
        break;
      }
    }
  }

  // 测试无认证请求
  console.log('\n🔍 测试无认证请求拒绝...');
  try {
    const response = await fetch(`${API_BASE}/api/core/evaluation/task/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageNum: 1, pageSize: 5 }),
      signal: AbortSignal.timeout(5000)
    });

    if (response.status === 401 || response.status === 403) {
      console.log('✅ 无认证请求正确被拒绝\n');
    } else {
      console.log(`⚠️  意外响应: HTTP ${response.status}\n`);
    }
  } catch (error) {
    console.log(`⚠️  无认证测试出错: ${error.message}\n`);
  }

  // 总结报告
  console.log('📊 测试结果汇总:');
  console.log('================');
  console.log(`成功的API调用: ${successCount}/${apiEndpoints.length}`);
  console.log(`检测到的认证方式: ${tokenType}`);

  if (successCount > 0) {
    console.log('\n🎉 权限系统工作正常！');
    console.log('\n💡 后续步骤:');
    console.log(
      '1. 运行完整测试: ./test/cases/function/packages/service/support/permission/evaluation/run-evaluation-tests.sh'
    );
    console.log(
      '2. 或运行vitest: pnpm test test/cases/function/packages/service/support/permission/evaluation/evaluation-permissions-simple.test.ts'
    );
  } else {
    console.log('\n💥 所有测试失败！');
    console.log('\n🔧 故障排查步骤:');
    console.log('1. 检查FastGPT服务是否运行: curl http://localhost:3000');
    console.log(
      '2. 重新获取token: 查看 test/cases/function/packages/service/support/permission/evaluation/get-token-guide.md'
    );
    console.log('3. 验证用户权限: 确保用户有评估模块访问权限');
    console.log('4. 检查token有效性: 尝试在浏览器中手动访问FastGPT');

    // 提供具体的调试命令
    console.log('\n🛠️  调试命令:');
    if (tokenType === 'apikey') {
      console.log(`curl -X POST "${API_BASE}/api/core/evaluation/task/list" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -H "Authorization: Bearer ${TEST_TOKEN}" \\`);
      console.log(`  -d '{"pageNum": 1, "pageSize": 5}'`);
    } else {
      console.log(`curl -X POST "${API_BASE}/api/core/evaluation/task/list" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -H "token: ${TEST_TOKEN}" \\`);
      console.log(`  -d '{"pageNum": 1, "pageSize": 5}'`);
    }
  }

  console.log('');
}

// 运行测试
smartTest().catch((error) => {
  console.error('\n💥 测试过程中出现错误:');
  console.error(error);
  process.exit(1);
});
