# 创建临时文件目录
mkdir projects/app/tmp
# 初始化UI库的自定义ts类型
pnpm run gen:theme-typings
# 安装 worker 里的依赖
cd worker && pnpm i --ignore-workspace
