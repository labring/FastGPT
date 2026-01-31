#!/usr/bin/env node
/**
 * 向量数据迁移 CLI 工具
 */
import * as fs from 'fs';
import * as path from 'path';
import { VectorMigrator } from './migrator';
import type { MigrationConfig } from './types';

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (command === 'migrate' || command === 'migrate-offline') {
    await migrateOffline();
  } else if (command === 'migrate-online') {
    await migrateOnline();
  } else if (command === 'status') {
    await showStatus();
  } else if (command === 'reset') {
    await resetCheckpoint();
  } else {
    showHelp();
  }
}

async function migrateOffline() {
  const configFile = args[1] || './migration-config.json';
  console.log(`📖 读取配置文件: ${configFile}`);

  if (!fs.existsSync(configFile)) {
    console.error(`❌ 配置文件不存在: ${configFile}`);
    console.log('💡 请先创建配置文件，参考 migration-config.example.json');
    process.exit(1);
  }

  const configContent = fs.readFileSync(configFile, 'utf-8');
  const config: MigrationConfig = JSON.parse(configContent);

  const migrator = new VectorMigrator(config);
  const result = await migrator.migrateOffline();

  console.log('\n📊 迁移结果:');
  console.log(`  成功: ${result.success ? '✅' : '❌'}`);
  console.log(`  总记录数: ${result.totalRecords}`);
  console.log(`  处理记录数: ${result.processedRecords}`);
  console.log(`  失败记录数: ${result.failedRecords}`);
  console.log(`  耗时: ${result.duration} 秒`);

  if (result.errors && result.errors.length > 0) {
    console.log('\n❌ 错误信息:');
    result.errors.forEach((error) => console.log(`  - ${error}`));
  }

  process.exit(result.success ? 0 : 1);
}

async function migrateOnline() {
  const configFile = args[1] || './migration-config.json';
  console.log(`📖 读取配置文件: ${configFile}`);

  if (!fs.existsSync(configFile)) {
    console.error(`❌ 配置文件不存在: ${configFile}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configFile, 'utf-8');
  const config: MigrationConfig = JSON.parse(configContent);

  // 确保启用 CDC
  config.enableCDC = true;

  const migrator = new VectorMigrator(config);
  const result = await migrator.migrateOnline();

  console.log('\n📊 迁移结果:');
  console.log(`  成功: ${result.success ? '✅' : '❌'}`);
  console.log(`  总记录数: ${result.totalRecords}`);
  console.log(`  处理记录数: ${result.processedRecords}`);
  console.log(`  失败记录数: ${result.failedRecords}`);
  console.log(`  耗时: ${result.duration} 秒`);

  process.exit(result.success ? 0 : 1);
}

async function showStatus() {
  const checkpointFile = './checkpoints/migration-checkpoint.json';
  if (!fs.existsSync(checkpointFile)) {
    console.log('❌ 未找到检查点文件，迁移可能尚未开始');
    return;
  }

  const checkpointContent = fs.readFileSync(checkpointFile, 'utf-8');
  const checkpoint = JSON.parse(checkpointContent);

  console.log('📊 迁移状态:');
  console.log(`  阶段: ${checkpoint.phase}`);
  console.log(`  已处理: ${checkpoint.totalProcessed}`);
  console.log(`  失败: ${checkpoint.totalFailed}`);
  console.log(`  开始时间: ${checkpoint.startTime}`);
  console.log(`  最后更新: ${checkpoint.lastUpdateTime}`);
  console.log(`  批次总数: ${checkpoint.batches.length}`);
  console.log(
    `  已完成批次: ${checkpoint.batches.filter((b: any) => b.status === 'completed').length}`
  );
}

async function resetCheckpoint() {
  const checkpointFile = './checkpoints/migration-checkpoint.json';
  if (fs.existsSync(checkpointFile)) {
    fs.unlinkSync(checkpointFile);
    console.log('✅ 检查点已清除');
  } else {
    console.log('ℹ️  检查点文件不存在');
  }
}

function showHelp() {
  console.log(`
向量数据迁移工具

用法:
  node cli.ts <command> [options]

命令:
  migrate, migrate-offline    执行停机迁移（全量迁移）
  migrate-online              执行在线迁移（增量迁移 + CDC）
  status                      显示迁移状态
  reset                       清除检查点

示例:
  node cli.ts migrate migration-config.json
  node cli.ts migrate-online migration-config.json
  node cli.ts status
  node cli.ts reset

配置文件示例请参考: migration-config.example.json
  `);
}

main().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
