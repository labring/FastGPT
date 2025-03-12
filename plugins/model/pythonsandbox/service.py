import subprocess
import json
import uvicorn
from fastapi import FastAPI, HTTPException
import ast
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
app = FastAPI()
def extract_imports(code):
    tree = ast.parse(code)
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(f"import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module
                for alias in node.names:
                    imports.append(f"from {module} import {alias.name}")
    return imports
seccomp_prefix = """
from seccomp import *
import sys
allowed_syscalls_str = "syscall.SYS_NEWFSTATAT, syscall.SYS_IOCTL, syscall.SYS_LSEEK, syscall.SYS_GETDENTS64, syscall.SYS_CLOSE, syscall.SYS_OPENAT, syscall.SYS_READ,syscall.SYS_FUTEX,syscall.SYS_MMAP, syscall.SYS_BRK, syscall.SYS_MPROTECT, syscall.SYS_MUNMAP, syscall.SYS_RT_SIGRETURN,syscall.SYS_MREMAP,syscall.SYS_SETUID, syscall.SYS_SETGID, syscall.SYS_GETUID,syscall.SYS_GETPID, syscall.SYS_GETPPID, syscall.SYS_GETTID,syscall.SYS_EXIT, syscall.SYS_EXIT_GROUP,syscall.SYS_TGKILL, syscall.SYS_RT_SIGACTION, syscall.SYS_IOCTL,syscall.SYS_SCHED_YIELD,syscall.SYS_SET_ROBUST_LIST, syscall.SYS_GET_ROBUST_LIST, syscall.SYS_RSEQ,syscall.SYS_CLOCK_GETTIME, syscall.SYS_GETTIMEOFDAY, syscall.SYS_NANOSLEEP,syscall.SYS_EPOLL_CREATE1,syscall.SYS_EPOLL_CTL, syscall.SYS_CLOCK_NANOSLEEP, syscall.SYS_PSELECT6,syscall.SYS_TIME,syscall.SYS_RT_SIGPROCMASK, syscall.SYS_SIGALTSTACK, syscall.SYS_CLONE,syscall.SYS_MKDIRAT,syscall.SYS_MKDIR,syscall.SYS_SOCKET, syscall.SYS_CONNECT, syscall.SYS_BIND, syscall.SYS_LISTEN, syscall.SYS_ACCEPT, syscall.SYS_SENDTO, syscall.SYS_RECVFROM,syscall.SYS_GETSOCKNAME, syscall.SYS_RECVMSG, syscall.SYS_GETPEERNAME, syscall.SYS_SETSOCKOPT, syscall.SYS_PPOLL, syscall.SYS_UNAME,syscall.SYS_SENDMSG, syscall.SYS_SENDMMSG, syscall.SYS_GETSOCKOPT,syscall.SYS_FSTAT, syscall.SYS_FCNTL, syscall.SYS_FSTATFS, syscall.SYS_POLL, syscall.SYS_EPOLL_PWAIT"
allowed_syscalls_tmp = allowed_syscalls_str.split(',')
L = []
for item in allowed_syscalls_tmp:
    item = item.strip()
    parts = item.split('.')[1][4:].lower()
    L.append(parts)
# create a filter object with a default KILL action
f = SyscallFilter(defaction=KILL)
for item in L:
    f.add_rule(ALLOW, item)
f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stdout.fileno()))
f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stderr.fileno()))
f.add_rule(ALLOW, 307)
f.add_rule(ALLOW, 318)
f.add_rule(ALLOW, 334)
f.add_rule(ALLOW, "open")
f.load()
"""
@app.post('/python_code')
async def run_code(data:dict):
    if not data or 'code' not in data or 'variables' not in data:
        return {'error': 'Invalid request format'}

    code = data['code']
    variables = data['variables']
    print(code)
    print(variables)
    imports = '\n'.join(extract_imports(code))
    var_def = ""
    output_code = "res = main("
    for k, v in variables.items():
        if isinstance(v, str):
            one_var = k + ' = \'' + v + '\'\n'
        else:
            one_var = k + ' = ' + str(v) + '\n'
        var_def = var_def + one_var
        output_code = output_code + k + ', '
    if output_code[-1] == '(':
        output_code = output_code + ')\n'
    else:
        output_code = output_code[:-2] + ')\n'
    output_code = output_code + "print(res)"
    code = imports + '\n' + seccomp_prefix + '\n' + var_def + '\n' + code + '\n' + output_code
    try:
        result = subprocess.run(['python3', '-c', code], capture_output=True, text=True, timeout=10)
        if result.returncode == -31:
            raise HTTPException(status_code=500, detail="Dangerous behavior detected.")
        if result.stderr != "":
            raise HTTPException(status_code=500, detail=result.stderr)

        out = ast.literal_eval(result.stdout.strip())
        out = json.dumps(out)
        print(out)
        respData = {
            "success":True,
            "data":{
                "codeReturn": out,
                "log": ""
            }
        }
        return JSONResponse(content=jsonable_encoder(respData))
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Time Limit Exceeds. (10s)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=e.detail)
if __name__ == "__main__":
    uvicorn.run(app,host="0.0.0.0", port=9985)