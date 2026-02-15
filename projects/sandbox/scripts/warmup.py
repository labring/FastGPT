# Python 预热脚本 - 预加载常用模块，进入等待循环
# 用于进程池模式，通过 stdin 逐行接收任务

import json
import sys

# 预加载常用模块
try:
    import numpy
except ImportError:
    pass
try:
    import pandas
except ImportError:
    pass

def execute_task(task):
    """执行单个任务"""
    code = task.get('code', '')
    variables = task.get('variables', {})
    temp_dir = task.get('tempDir', '/tmp')

    try:
        # 编译并执行用户代码
        exec_globals = {'variables': variables}
        exec(code, exec_globals)

        main_fn = exec_globals.get('main')
        if not main_fn:
            return {"success": False, "error": "No main function defined"}

        result = main_fn(variables)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


# 主循环：逐行读取任务
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        task = json.loads(line)
        result = execute_task(task)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, default=str) + '\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"success": False, "error": str(e)}) + '\n')
        sys.stdout.flush()
