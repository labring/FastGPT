const fs = require('fs');
const path = require('path');

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Please provide the file name as an argument. Usage: npm create i18n <filename>');
  process.exit(1);
}

const fileName = `${args[0]}.json`; // 生成的文件名
const languages = ['zh-Hant', 'zh-CN', 'en'];
// 使用 process.cwd() 获取当前工作目录
const basePath = path.join(process.cwd(), 'packages', 'web', 'i18n');
const typesPath = path.join(process.cwd(), 'packages', 'web', 'types', 'i18next.d.ts');

// 创建国际化文件
languages.forEach((language) => {
  const filePath = path.join(basePath, language, fileName);
  // 检查文件是否已存在，避免覆盖
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2)); // 创建 JSON 文件
    console.log(`Created: ${filePath}`);
  } else {
    console.log(`File already exists: ${filePath}`);
  }
});

// 更新 i18next.d.ts
fs.readFile(typesPath, 'utf-8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err}`);
    return;
  }

  // 添加新的命名空间
  const newNamespace = `\nimport ${args[0]} from '../i18n/zh-CN/${fileName}';`;
  const updatedData = data.replace(/(import\s*'.*?';)/g, `$1${newNamespace}`);

  // 更新 I18nNamespaces 接口
  const namespacePattern = /export interface I18nNamespaces {([\s\S]*?)}/;
  const newNamespaceEntry = `  ${args[0]}: typeof ${args[0]};\n`;
  const updatedNamespaces = updatedData.replace(namespacePattern, (match, p1) => {
    return `export interface I18nNamespaces {\n${p1}${newNamespaceEntry}};`;
  });

  // 更新 defaultNS
  const defaultNSPattern = /defaultNS:\s*\[\s*([\s\S]*?)\s*\];/;
  const updatedDefaultNS = updatedNamespaces.replace(defaultNSPattern, (match, p1) => {
    return `defaultNS: [${p1.trim()}, \n'${args[0]}'\n];`;
  });

  // 检查修改后的内容是否已变更
  if (updatedDefaultNS !== updatedData) {
    fs.writeFile(typesPath, updatedDefaultNS, 'utf-8', (err) => {
      if (err) {
        console.error(`Error writing file: ${err}`);
        return;
      }
      console.log(`Updated: ${typesPath}`);
    });
  } else {
    console.log('No changes made to i18next.d.ts.');
  }
});
