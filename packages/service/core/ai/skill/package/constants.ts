/**
 * Skill ZIP 包相关常量模板。
 */

export const DEFAULT_GITIGNORE_CONTENT = `# FastGPT Skill ignore patterns
# These patterns define files/folders that should not be packaged when deploying/exporting.

# Node.js dependencies
node_modules/
.npm/
.yarn/
.pnpm-store/
package.zip

# Python dependencies & cache
__pycache__/
*.pyc
*.pyo
*.pyd
.venv/
venv/
env/
.pytest_cache/
*.egg-info/
.eggs/

# Output/Build folders
dist/
build/
.next/
out/
.nuxt/

# IDE/Editor config files
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
__MACOSX/
Thumbs.db
ehthumbs.db
desktop.ini

# Large media & binaries
*.mp4
*.avi
*.mkv
*.mov
*.mp3
*.wav
*.flac
*.tgz
*.tar
*.tar.gz
*.rar
*.7z
*.exe
*.dll
*.so
*.dylib
*.dmg
*.pkg
*.iso

# Log files
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
`;
