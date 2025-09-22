const fs = require('fs');
const path = require('path');

/**
 * 检查 i18n 文件夹中三种语言的词条完整性
 * 输出缺失的词条信息，支持自动修复
 */

// 语言文件夹配置
const LANGUAGES = ['en', 'zh-CN', 'zh-Hant'];

// 解析命令行参数
const args = process.argv.slice(2);
const AUTO_FIX = args.includes('--fix') || args.includes('-f');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔧 i18n 词条完整性检查工具

用法:
  node checkI18nCompleteness.js [选项]

选项:
  --fix, -f     自动修复缺失的词条
  --help, -h    显示帮助信息

示例:
  node checkI18nCompleteness.js          # 仅检查，不修复
  node checkI18nCompleteness.js --fix    # 检查并自动修复
  `);
  process.exit(0);
}

/**
 * 获取 i18n 目录路径
 * 支持从不同位置执行脚本
 */
function getI18nDir() {
  const cwd = process.cwd();
  
  // 如果当前目录已经是 packages/web，直接使用 i18n 子目录
  if (cwd.endsWith(path.join('packages', 'web'))) {
    return path.join(cwd, 'i18n');
  }
  
  // 如果在项目根目录，使用完整路径
  if (fs.existsSync(path.join(cwd, 'packages', 'web', 'i18n'))) {
    return path.join(cwd, 'packages', 'web', 'i18n');
  }
  
  // 尝试从脚本所在位置推断项目根目录
  const scriptDir = __dirname; // scripts/i18n
  const projectRoot = path.resolve(scriptDir, '..', '..'); // 向上两级到项目根目录
  const i18nPath = path.join(projectRoot, 'packages', 'web', 'i18n');
  
  if (fs.existsSync(i18nPath)) {
    return i18nPath;
  }
  
  // 如果都找不到，返回默认路径用于错误提示
  return path.join(cwd, 'packages', 'web', 'i18n');
}

const I18N_DIR = getI18nDir();

/**
 * 递归获取目录下所有 JSON 文件
 * @param {string} dir - 目录路径
 * @returns {string[]} JSON 文件路径数组
 */
function getJsonFiles(dir) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getJsonFiles(fullPath));
    } else if (path.extname(item) === '.json') {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * 获取 JSON 对象的所有键（保持原有格式，不递归展开）
 * @param {object} obj - JSON 对象
 * @returns {string[]} 所有键数组
 */
function getObjectKeys(obj) {
  return Object.keys(obj);
}

/**
 * 递归获取 JSON 对象的所有键路径（用于显示和比较）
 * @param {object} obj - JSON 对象
 * @param {string} prefix - 键路径前缀
 * @returns {string[]} 所有键路径数组
 */
function getObjectKeysRecursive(obj, prefix = '') {
  const keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getObjectKeysRecursive(value, currentPath));
    } else {
      keys.push(currentPath);
    }
  }
  
  return keys;
}

/**
 * 获取指定语言的所有词条
 * @param {string} language - 语言代码
 * @returns {Map<string, Set<string>>} 文件名到词条集合的映射
 */
function getLanguageKeys(language) {
  const langDir = path.join(I18N_DIR, language);
  const fileKeysMap = new Map();
  
  if (!fs.existsSync(langDir)) {
    console.warn(`警告: 语言目录 ${language} 不存在`);
    return fileKeysMap;
  }
  
  const jsonFiles = getJsonFiles(langDir);
  
  for (const filePath of jsonFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(content);
      
      // 获取相对于语言目录的文件名
      const relativePath = path.relative(langDir, filePath);
      const fileName = relativePath.replace(/\\/g, '/'); // 统一使用正斜杠
      
      // 直接获取顶级键，不递归展开
      const keys = getObjectKeys(jsonData);
      fileKeysMap.set(fileName, new Set(keys));
      
    } catch (error) {
      console.error(`错误: 无法解析文件 ${filePath}:`, error.message);
    }
  }
  
  return fileKeysMap;
}

/**
 * 获取指定语言的所有词条及其值
 * @param {string} language - 语言代码
 * @returns {Map<string, Map<string, any>>} 文件名到词条键值对的映射
 */
function getLanguageKeysWithValues(language) {
  const langDir = path.join(I18N_DIR, language);
  const fileKeysMap = new Map();
  
  if (!fs.existsSync(langDir)) {
    return fileKeysMap;
  }
  
  const jsonFiles = getJsonFiles(langDir);
  
  for (const filePath of jsonFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(content);
      
      const relativePath = path.relative(langDir, filePath);
      const fileName = relativePath.replace(/\\/g, '/');
      
      // 直接存储顶级键值对，不递归展开
      const keyValueMap = new Map();
      for (const [key, value] of Object.entries(jsonData)) {
        keyValueMap.set(key, value);
      }
      fileKeysMap.set(fileName, keyValueMap);
      
    } catch (error) {
      console.error(`错误: 无法解析文件 ${filePath}:`, error.message);
    }
  }
  
  return fileKeysMap;
}

/**
 * 设置对象的值（保持扁平化结构）
 * @param {object} obj - 目标对象
 * @param {string} key - 键名
 * @param {any} value - 要设置的值
 */
function setValue(obj, key, value) {
  obj[key] = value;
}

/**
 * 创建缺失的文件
 * @param {string} language - 语言代码
 * @param {string} fileName - 文件名
 */
function createMissingFile(language, fileName) {
  const langDir = path.join(I18N_DIR, language);
  const filePath = path.join(langDir, fileName);
  
  // 确保目录存在
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  
  // 创建空的 JSON 文件
  fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  console.log(`  ✅ 已创建文件: ${filePath}`);
}

/**
 * 修复缺失的词条
 * @param {string} language - 目标语言
 * @param {string} fileName - 文件名
 * @param {string} key - 词条键名
 * @param {any} value - 词条值
 */
function fixMissingKey(language, fileName, key, value) {
  const langDir = path.join(I18N_DIR, language);
  const filePath = path.join(langDir, fileName);
  
  try {
    let jsonData = {};
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      jsonData = JSON.parse(content);
    }
    
    // 直接设置键值，保持扁平化结构
    setValue(jsonData, key, value);
    
    // 写回文件，确保格式正确（最后一个词条后不加逗号）
    const jsonString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(filePath, jsonString);
    
    console.log(`    ✅ 已添加词条 "${key}" 到 ${language}/${fileName}`);
    
  } catch (error) {
    console.error(`    ❌ 修复词条失败 "${key}" 在 ${language}/${fileName}:`, error.message);
  }
}

/**
 * 获取词条的最佳值（优先 zh-CN，其次任意可用值）
 * @param {string} key - 词条键名
 * @param {Map<string, Map<string, any>>} allLanguageValues - 所有语言的词条值
 * @returns {any} 词条值
 */
function getBestValue(key, allLanguageValues) {
  // 优先使用 zh-CN 的值
  if (allLanguageValues.has('zh-CN')) {
    const zhCNValues = allLanguageValues.get('zh-CN');
    if (zhCNValues.has(key)) {
      return zhCNValues.get(key);
    }
  }
  
  // 如果 zh-CN 没有，使用任意可用的值
  for (const [, values] of allLanguageValues) {
    if (values.has(key)) {
      return values.get(key);
    }
  }
  
  // 如果都没有，返回键名作为默认值
  return key;
}

/**
 * 主函数：检查词条完整性
 */
function checkI18nCompleteness() {
  console.log('🔍 开始检查 i18n 词条完整性...\n');
  console.log(`📁 检查目录: ${I18N_DIR}`);
  console.log(`🔧 自动修复模式: ${AUTO_FIX ? '开启' : '关闭'}\n`);
  
  // 检查 i18n 目录是否存在
  if (!fs.existsSync(I18N_DIR)) {
    console.error(`❌ i18n 目录不存在: ${I18N_DIR}`);
    process.exit(1);
  }
  
  // 获取所有语言的词条（仅键）
  const languageKeysMap = new Map();
  for (const lang of LANGUAGES) {
    languageKeysMap.set(lang, getLanguageKeys(lang));
  }
  
  // 获取所有语言的词条（键值对）- 用于自动修复
  let languageValuesMap = new Map();
  if (AUTO_FIX) {
    for (const lang of LANGUAGES) {
      languageValuesMap.set(lang, getLanguageKeysWithValues(lang));
    }
  }
  
  // 获取所有文件名的并集
  const allFiles = new Set();
  for (const [, fileKeysMap] of languageKeysMap) {
    for (const fileName of fileKeysMap.keys()) {
      allFiles.add(fileName);
    }
  }
  
  if (allFiles.size === 0) {
    console.log('📄 未找到任何 JSON 文件');
    return;
  }
  
  let hasIssues = false;
  let fixedIssues = 0;
  
  // 检查每个文件
  for (const fileName of Array.from(allFiles).sort()) {
    console.log(`📄 检查文件: ${fileName}`);
    
    // 检查文件是否在所有语言中都存在
    const missingInLanguages = [];
    for (const lang of LANGUAGES) {
      const fileKeysMap = languageKeysMap.get(lang);
      if (!fileKeysMap.has(fileName)) {
        missingInLanguages.push(lang);
      }
    }
    
    if (missingInLanguages.length > 0) {
      console.log(`  ❌ 文件缺失在语言: ${missingInLanguages.join(', ')}`);
      
      if (AUTO_FIX) {
        console.log(`  🔧 正在修复缺失的文件...`);
        for (const lang of missingInLanguages) {
          createMissingFile(lang, fileName);
          // 重新获取该语言的词条信息
          languageKeysMap.set(lang, getLanguageKeys(lang));
          if (AUTO_FIX) {
            languageValuesMap.set(lang, getLanguageKeysWithValues(lang));
          }
          fixedIssues++;
        }
      }
      
      hasIssues = true;
    }
    
    // 获取所有语言中该文件的词条
    const fileKeysInLanguages = new Map();
    const fileValuesInLanguages = new Map();
    
    for (const lang of LANGUAGES) {
      const fileKeysMap = languageKeysMap.get(lang);
      if (fileKeysMap.has(fileName)) {
        fileKeysInLanguages.set(lang, fileKeysMap.get(fileName));
        
        if (AUTO_FIX) {
          const fileValuesMap = languageValuesMap.get(lang);
          if (fileValuesMap && fileValuesMap.has(fileName)) {
            fileValuesInLanguages.set(lang, fileValuesMap.get(fileName));
          }
        }
      }
    }
    
    // 获取所有词条的并集
    const allKeysInFile = new Set();
    for (const [, keys] of fileKeysInLanguages) {
      for (const key of keys) {
        allKeysInFile.add(key);
      }
    }
    
    // 检查每个词条在所有语言中的存在情况
    const missingKeys = new Map();
    for (const key of allKeysInFile) {
      const missingInLangs = [];
      for (const lang of LANGUAGES) {
        const keys = fileKeysInLanguages.get(lang);
        if (!keys || !keys.has(key)) {
          missingInLangs.push(lang);
        }
      }
      
      if (missingInLangs.length > 0) {
        missingKeys.set(key, missingInLangs);
      }
    }
    
    if (missingKeys.size > 0) {
      console.log(`  ❌ 发现 ${missingKeys.size} 个缺失的词条:`);
      
      for (const [key, missingLangs] of missingKeys) {
        console.log(`    - "${key}" 缺失在: ${missingLangs.join(', ')}`);
        
        if (AUTO_FIX) {
          // 获取最佳值用于修复
          const bestValue = getBestValue(key, fileValuesInLanguages);
          
          for (const lang of missingLangs) {
            fixMissingKey(lang, fileName, key, bestValue);
            fixedIssues++;
          }
        }
      }
      
      hasIssues = true;
    } else {
      console.log(`  ✅ 词条完整`);
    }
    
    console.log('');
  }
  
  // 输出统计信息
  console.log('📊 统计信息:');
  for (const lang of LANGUAGES) {
    const fileKeysMap = languageKeysMap.get(lang);
    const totalFiles = fileKeysMap.size;
    let totalKeys = 0;
    for (const [, keys] of fileKeysMap) {
      totalKeys += keys.size;
    }
    console.log(`  ${lang}: ${totalFiles} 个文件, ${totalKeys} 个词条`);
  }
  
  if (AUTO_FIX && fixedIssues > 0) {
    console.log(`\n🔧 自动修复完成！共修复了 ${fixedIssues} 个问题。`);
    console.log('💡 建议重新运行检查以确认修复结果。');
  } else if (!hasIssues) {
    console.log('\n🎉 所有词条都已完整定义在三种语言中！');
  } else if (!AUTO_FIX) {
    console.log('\n⚠️  发现词条不完整的问题，请检查上述输出。');
    console.log('💡 使用 --fix 参数可以自动修复这些问题。');
  }
}

// 运行检查
if (require.main === module) {
  checkI18nCompleteness();
}

module.exports = { checkI18nCompleteness };
