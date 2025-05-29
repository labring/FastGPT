import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
const program = new Command();

program
  .name('new')
  .description('Create a new tool or toolset')
  .option('--toolset', 'Create a toolset')
  .argument('<name>', 'name');

program.parse();

const isToolset = program.opts().toolset as boolean;
const name = program.args[0];

// name validation:
// 1. less than 20 characters
if (name.length > 20) {
  console.error('Tool name must be less than 20 characters');
  process.exit(1);
}

console.log('Creating tool: ', name);
// copy template to tools/<name>

const templateDir = path.join('scripts', 'template');

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

if (isToolset) {
  copyTemplate(templateDir, toolDir);
} else {
  copyTemplate(path.join(templateDir, 'tool'), toolDir);
  // update package.json
  const packageJsonPath = path.join(templateDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  packageJson.name = `fastgpt-tools-${name}`;
  fs.writeFileSync(toolDir + '/package.json', JSON.stringify(packageJson, null, 2));
}

// output success message
console.log(`
Tool/Toolset created successfully! 🎉Next steps:
- cd tools/${name}
- bun i
`);
