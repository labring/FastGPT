#!/usr/bin/env node
'use strict';

/**
 * i18n 全面检查编排脚本
 *
 * 依次执行以下三个检查脚本并收集结果，最后输出统一摘要：
 *   1. check-page-ns.js       — 检查页面命名空间声明完整性
 *   2. check-missing-keys.js  — 检查源代码中缺失的 zh-CN 词条
 *   3. check-cn-in-en-i18n.js — 检查英文词条中是否存在中文
 *
 * 用法:
 *   node scripts/i18n/check-all.js
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = __dirname;
const NODE = process.execPath;

const CHECKS = [
  {
    name: '页面命名空间检查 (check-page-ns)',
    script: path.join(SCRIPTS_DIR, 'check-page-ns.js'),
    description: '检查页面使用的 i18n namespace 是否在 getServerSideProps 中完整声明',
  },
  {
    name: '缺失词条检查 (check-missing-keys)',
    script: path.join(SCRIPTS_DIR, 'check-missing-keys.js'),
    description: '扫描源代码中使用的 i18n key，检查 zh-CN 中是否有对应词条',
  },
  {
    name: '英文词条中文检查 (check-cn-in-en-i18n)',
    script: path.join(SCRIPTS_DIR, 'check-cn-in-en-i18n.js'),
    description: '检测英文词条中是否存在中文字符',
  },
];

/**
 * 执行单个检查脚本
 * @param {{ name: string, script: string, description: string }} check
 * @returns {{ passed: boolean, output: string, error?: string }}
 */
function runCheck(check) {
  try {
    const stdout = execFileSync(NODE, [check.script], {
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { passed: true, output: stdout.trim() };
  } catch (err) {
    // exit code !== 0 视为检查未通过，但仍保留 stdout 用于分析
    const output = (err.stdout || '').trim();
    const stderr = (err.stderr || '').trim();
    const errorMsg = err.status !== null ? `exit code ${err.status}` : err.message;
    return { passed: false, output, error: errorMsg + (stderr ? `\n${stderr}` : '') };
  }
}

/**
 * 解析检查输出中的关键统计信息
 * @param {string} name
 * @param {string} output
 * @param {string|null} errorMsg - 脚本执行错误信息（执行失败时为非空）
 * @returns {{ summary: string, issues: string[] }}
 */
function parseSummary(name, output, errorMsg) {
  const issues = [];
  let summary = '';

  // 执行报错（无法正常运行），返回错误信息
  if (errorMsg && !output) {
    return { summary: `执行异常: ${errorMsg}`, issues: [] };
  }

  if (name.includes('命名空间')) {
    const statMatch = output.match(/[✅❌]\s*扫描完成[：:]\s*共\s*(\d+)\s*个页面[，,\s]*(\d+)\s*个通过[，,\s]*(\d+)\s*个有问题/);
    if (statMatch) {
      summary = `共 ${statMatch[1]} 个页面, ${statMatch[2]} 通过, ${statMatch[3]} 有问题`;
    }
    const failLines = output.match(/❌\s{2}(\S+)\s{2}\(缺少\s*\d+\s*个[^)]+\)/g);
    if (failLines) {
      for (const line of failLines) {
        issues.push(line.trim());
      }
    }
  } else if (name.includes('缺失词条')) {
    // 通过时: "✅ 所有 zh-CN 词条均已存在"
    if (/✅\s*所有\s*zh-CN\s*词条均已存在/.test(output)) {
      summary = '所有词条均存在，无缺失';
    } else {
      const statMatch = output.match(/📊\s*合计缺失[：:]\s*(\d+)\s*个词条[，,\s]*涉及\s*(\d+)\s*个命名空间/);
      if (statMatch) {
        summary = `合计缺失 ${statMatch[1]} 个词条，涉及 ${statMatch[2]} 个命名空间`;
      }
      const nsLines = output.match(/📄\s*\S+\s*\(\d+\s*个缺失\)/g);
      if (nsLines) {
        for (const line of nsLines) {
          issues.push(line.trim());
        }
      }
    }
  } else if (name.includes('英文词条')) {
    // 通过时: "未发现任何中文词条"
    if (/未发现任何中文词条/.test(output)) {
      summary = '所有英文词条检查通过';
    } else {
      const statMatch = output.match(/总计发现\s*(\d+)\s*个中文词条/);
      if (statMatch && statMatch[1] !== '0') {
        summary = `发现 ${statMatch[1]} 个包含中文的英文词条`;
        const fileLines = output.match(/\[.*?\]\s*发现\s*\d+\s*个中文词条/g);
        if (fileLines) {
          for (const line of fileLines) {
            issues.push(line.trim());
          }
        }
      } else {
        summary = '所有英文词条检查通过';
      }
    }
  }

  return { summary, issues };
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FastGPT i18n 全面检查');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (let i = 0; i < CHECKS.length; i++) {
    const check = CHECKS[i];
    console.log(`[${i + 1}/${CHECKS.length}] 正在执行: ${check.name}...`);
    console.log(`    说明: ${check.description}\n`);

    const result = runCheck(check);
    const parsed = parseSummary(check.name, result.output, result.error);

    results.push({ check, result, parsed });

    if (result.passed) {
      console.log(`    ✅ 通过 — ${parsed.summary || '无问题'}\n`);
      totalPassed++;
    } else {
      const reason = parsed.summary || result.error || '检查失败';
      console.log(`    ❌ 未通过 — ${reason}\n`);
      totalFailed++;
    }
  }

  // ── 汇总报告 ──────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  汇总报告');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`检查项: ${results.length} 项`);
  console.log(`通过:   ${totalPassed} 项`);
  console.log(`未通过: ${totalFailed} 项\n`);

  for (const { check, result, parsed } of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${check.name}`);
    console.log(`   统计: ${parsed.summary || '无法解析'}`);

    if (parsed.issues.length > 0) {
      console.log(`   详情:`);
      for (const issue of parsed.issues.slice(0, 10)) {
        console.log(`     - ${issue}`);
      }
      if (parsed.issues.length > 10) {
        console.log(`     ...还有 ${parsed.issues.length - 10} 项，详见上方完整输出`);
      }
    }
    console.log('');
  }

  if (totalFailed > 0) {
    console.log('💡 提示: 可分别运行以下命令查看完整输出:');
    console.log('   node scripts/i18n/check-page-ns.js');
    console.log('   node scripts/i18n/check-missing-keys.js');
    console.log('   node scripts/i18n/check-cn-in-en-i18n.js\n');
    process.exit(1);
  } else {
    console.log('🎉 所有 i18n 检查均通过！\n');
    process.exit(0);
  }
}

main();
