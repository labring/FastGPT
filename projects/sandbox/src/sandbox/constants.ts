export const pythonScript = `
import os
import subprocess
import json
import ast
import base64

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
import errno
allowed_syscalls = [
    "syscall.SYS_NEWFSTATAT",
    "syscall.SYS_LSEEK",
    "syscall.SYS_GETDENTS64",
    "syscall.SYS_CLOSE",
    "syscall.SYS_FUTEX",
    "syscall.SYS_MMAP",
    "syscall.SYS_BRK",
    "syscall.SYS_MPROTECT",
    "syscall.SYS_MUNMAP",
    "syscall.SYS_RT_SIGRETURN",
    "syscall.SYS_MREMAP",
    "syscall.SYS_SETUID",
    "syscall.SYS_SETGID",
    "syscall.SYS_GETUID",
    "syscall.SYS_GETPID",
    "syscall.SYS_GETPPID",
    "syscall.SYS_GETTID",
    "syscall.SYS_EXIT",
    "syscall.SYS_EXIT_GROUP",
    "syscall.SYS_TGKILL",
    "syscall.SYS_RT_SIGACTION",
    "syscall.SYS_SCHED_YIELD",
    "syscall.SYS_SET_ROBUST_LIST",
    "syscall.SYS_GET_ROBUST_LIST",
    "syscall.SYS_RSEQ",
    "syscall.SYS_CLOCK_GETTIME",
    "syscall.SYS_GETTIMEOFDAY",
    "syscall.SYS_NANOSLEEP",
    "syscall.SYS_CLOCK_NANOSLEEP",
    "syscall.SYS_TIME",
    "syscall.SYS_RT_SIGPROCMASK",
    "syscall.SYS_SIGALTSTACK",
    "syscall.SYS_CLONE",
    "syscall.SYS_MKDIRAT",
    "syscall.SYS_MKDIR",
    "syscall.SYS_FSTAT",
    "syscall.SYS_FCNTL",
    "syscall.SYS_FSTATFS",
]
allowed_syscalls_tmp = allowed_syscalls
L = []
for item in allowed_syscalls_tmp:
    item = item.strip()
    parts = item.split(".")[1][4:].lower()
    L.append(parts)
f = SyscallFilter(defaction=KILL)
for item in L:
    f.add_rule(ALLOW, item)
f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stdout.fileno()))
f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stderr.fileno()))
f.add_rule(ALLOW, 307)
f.add_rule(ALLOW, 318)
f.add_rule(ALLOW, 334)
f.load()
"""

def remove_print_statements(code):
    class PrintRemover(ast.NodeTransformer):
        def visit_Expr(self, node):
            if (
                isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name)
                and node.value.func.id == "print"
            ):
                return None
            return node

    tree = ast.parse(code)
    modified_tree = PrintRemover().visit(tree)
    ast.fix_missing_locations(modified_tree)
    return ast.unparse(modified_tree)

def detect_dangerous_imports(code):
    dangerous_modules = ["os", "sys", "subprocess", "shutil", "socket", "ctypes", "multiprocessing", "threading", "pickle"]
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in dangerous_modules:
                    return alias.name
        elif isinstance(node, ast.ImportFrom):
            if node.module in dangerous_modules:
                return node.module
    return None

def run_pythonCode(data:dict):
    if not data or "code" not in data or "variables" not in data:
        return {"error": "Invalid request format"}
    code = data["code"]
    code = remove_print_statements(code)
    dangerous_import = detect_dangerous_imports(code)
    if dangerous_import:
        return {"error": f"Importing {dangerous_import} is not allowed."}
    variables = data["variables"]
    imports = "\\n".join(extract_imports(code))
    var_def = ""
    output_code = "if __name__ == '__main__':\\n    res = main("
    for k, v in variables.items():
        one_var = f"{k} = {json.dumps(v)}\\n"
        var_def = var_def + one_var
        output_code = output_code + k + ", "
    if output_code[-1] == "(":
        output_code = output_code + ")\\n"
    else:
        output_code = output_code[:-2] + ")\\n"
    output_code = output_code + "    print(res)"
    code = imports + "\\n" + seccomp_prefix + "\\n" + var_def + "\\n" + code + "\\n" + output_code
    tmp_file = os.path.join(data["tempDir"], "subProcess.py")
    with open(tmp_file, "w", encoding="utf-8") as f:
        f.write(code)
    try:
        result = subprocess.run(["python3", tmp_file], capture_output=True, text=True, timeout=10)
        if result.returncode == -31:
            return {"error": "Dangerous behavior detected."}
        if result.stderr != "":
            return {"error": result.stderr}

        out = ast.literal_eval(result.stdout.strip())
        return out
    except subprocess.TimeoutExpired:
        return {"error": "Timeout error or blocked by system security policy"}
    except Exception as e:
        return {"error": str(e)}

`;
