const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 项目名称和描述
const projectName = "FastGPT";
const projectDescription = "FastGPT 文档";

// 文档目录，使用相对路径
const docsDir = path.join(__dirname, './content/zh-cn/docs');
// 基础 URL
const baseUrl = "https://doc.fastgpt.cn/docs/";

// 生成 llms.txt
let llmsTxtContent = `# ${projectName}\n${projectDescription}\n`;

function getMdInfo(filePath) {
    try {
        // 读取文件内容
        const content = fs.readFileSync(filePath, 'utf8');
        // 找到前置元数据的起始和结束位置
        const startIndex = content.indexOf('---');
        const endIndex = content.indexOf('---', startIndex + 3);
        if (startIndex !== -1 && endIndex !== -1) {
            const frontMatterStr = content.slice(startIndex + 3, endIndex).trim();
            // 使用 yaml 解析前置元数据
            const frontMatter = yaml.load(frontMatterStr);
            const title = frontMatter.title;
            const description = frontMatter.description;
            return [title, description];
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`文件 ${filePath} 未找到。`);
        } else {
            console.log(`解析 ${filePath} 的前置元数据时出错:`, error.message);
        }
    }
    return [null, null];
}

// 遍历文档目录
function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(entryPath);
        } else if (entry.name.endsWith('.md')) {
            if (entry.name === "_index.md") {
                continue;
            }

            const relativePath = path.relative(docsDir, entryPath);
            const sectionName = path.dirname(relativePath) || 'Home';
            if (!llmsTxtContent.includes(`## ${sectionName}`)) {
                llmsTxtContent += `\n## ${sectionName}\n`;
            }
            const fullUrl = baseUrl + relativePath.replace(/\\/g, '/').replace('.md', '/');
            const [title, description] = getMdInfo(entryPath);
            const finalTitle = title || path.basename(entry.name, '.md');
            const finalDescription = description || '';
            llmsTxtContent += `- [${finalTitle}](${fullUrl}) ${finalDescription}\n`;
        }
    }
}

walkDir(docsDir);

// 保存 llms.txt
const saveDir = path.join(__dirname, './static');
if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
}
const llmsTxtSavePath = path.join(saveDir, 'llms.txt');
fs.writeFileSync(llmsTxtSavePath, llmsTxtContent, {
    encoding: 'utf-8'
});

// 生成 llms - full.txt
let llmsFullTxtContent = '';
function collectMdContent(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectMdContent(entryPath);
        } else if (entry.name.endsWith('.md')) {
            if (entry.name === "_index.md") {
                continue;
            }

            const content = fs.readFileSync(entryPath, 'utf8');
            // 找到前置元数据的起始和结束位置
            const startIndex = content.indexOf('---');
            const endIndex = content.indexOf('---', startIndex + 3);
            if (startIndex !== -1 && endIndex !== -1) {
                const frontMatterStr = content.slice(startIndex + 3, endIndex).trim();
                // 使用 yaml 解析前置元数据
                const frontMatter = yaml.load(frontMatterStr);
                const title = frontMatter.title || '';
                const description = frontMatter.description || '';
                // 提取标题和描述后，删除首部元数据
                const newContent = content.slice(endIndex + 3).trim();
                llmsFullTxtContent += `# ${title}\n## ${description}\n\n${newContent}\n\n`;
            } else {
                llmsFullTxtContent += content + '\n\n';
            }
        }
    }
}

collectMdContent(docsDir);

// 保存 llms - full.txt
const llmsFullTxtSavePath = path.join(saveDir, 'llms-full.txt');
fs.writeFileSync(llmsFullTxtSavePath, llmsFullTxtContent, {
    encoding: 'utf-8'
});
