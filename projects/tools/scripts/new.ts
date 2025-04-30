import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
const program = new Command();

program
  .name('new')
  .description('Create a new tool or folder')
  .option('-f --folder', 'Create a folder')
  .argument('<name>', 'name');

program.parse();

const isFolder = program.opts().folder as boolean;
const name = program.args[0];

// name validation:
// 1. less than 20 characters
// 2. kebab-case
if (name.length > 20) {
  console.error('Tool name must be less than 20 characters');
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(name)) {
  console.error('Tool name must be kebab-case');
  process.exit(1);
}

console.log('Creating tool', name);
// copy template to tools/<name>

const templateDir = isFolder
  ? path.join('scripts', 'template', 'folder')
  : path.join('scripts', 'template', 'tool');

const toolDir = path.join('tools', name);

if (!fs.existsSync(toolDir)) {
  fs.mkdirSync(toolDir, { recursive: true });
}

const copyTemplate = (src: string, dest: string) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((file) => {
      copyTemplate(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

copyTemplate(templateDir, toolDir);

// update package.json
const packageJsonPath = path.join(toolDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
packageJson.name = `fastgpt-tools-${name}`;
packageJson.module = 'index.ts';
packageJson.type = 'module';
packageJson.devDependencies = {
  '@types/bun': 'latest'
};
packageJson.peerDependencies = {
  typescript: '^5.0.0'
};
packageJson.dependencies = {};
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// output success message
console.log('Tool created successfully! 🎉');
console.log('Next steps:');
console.log('- cd tools/' + name);
console.log('- bun i');
