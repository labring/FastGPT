import { ast, query } from '@phenomnomnominal/tsquery';
import * as path from 'path';
import * as fs from 'fs';
//
const root = path.join(__dirname, '../../');
// get all files in the project recursively

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

const allFiles = getAllFiles(root)
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .filter((file) => !file.includes('node_modules'))
  .filter((file) => !file.includes('jieba'));

async function processFiles(allFiles: string[]) {
  try {
    // 并行读取所有文件内容
    const fileContents = await Promise.all(allFiles.map((file) => fs.readFileSync(file, 'utf-8')));

    // 处理每个文件的内容
    fileContents.forEach((content, index) => {
      const astTree = ast(content);
      const res = query(astTree, 'JsxText,StringLiteral');
      for (const node of res) {
        const text = node.getText().trim();
        if (text.length > 0 && text.match(/[\u4e00-\u9fa5]/g)) {
          console.log(allFiles[index], text);
        }
      }
    });
  } catch (error) {
    console.error('Error processing files:', error);
  }
}

processFiles(allFiles);
