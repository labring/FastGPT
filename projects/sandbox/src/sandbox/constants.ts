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
import platform
import sys

# Skip seccomp on macOS since it's Linux-specific
if platform.system() == 'Linux':
    try:
        from seccomp import *
        import errno
        allowed_syscalls = [
            # File operations - READ ONLY (removed SYS_WRITE)
            "syscall.SYS_READ",
            # Removed "syscall.SYS_WRITE" - no general write access
            "syscall.SYS_OPEN",      # Still needed for reading files
            "syscall.SYS_OPENAT",   # Still needed for reading files
            "syscall.SYS_CLOSE",
            "syscall.SYS_FSTAT",
            "syscall.SYS_LSTAT",
            "syscall.SYS_STAT",
            "syscall.SYS_NEWFSTATAT",
            "syscall.SYS_LSEEK",
            "syscall.SYS_GETDENTS64",
            "syscall.SYS_FCNTL",
            "syscall.SYS_ACCESS",
            "syscall.SYS_FACCESSAT",
            
            # Memory management - essential for Python
            "syscall.SYS_MMAP",
            "syscall.SYS_BRK",
            "syscall.SYS_MPROTECT",
            "syscall.SYS_MUNMAP",
            "syscall.SYS_MREMAP",
            
            # Process/thread operations
            "syscall.SYS_GETUID",
            "syscall.SYS_GETGID",
            "syscall.SYS_GETEUID",
            "syscall.SYS_GETEGID",
            "syscall.SYS_GETPID",
            "syscall.SYS_GETPPID",
            "syscall.SYS_GETTID",
            "syscall.SYS_EXIT",
            "syscall.SYS_EXIT_GROUP",
            
            # Signal handling
            "syscall.SYS_RT_SIGACTION",
            "syscall.SYS_RT_SIGPROCMASK",
            "syscall.SYS_RT_SIGRETURN",
            "syscall.SYS_SIGALTSTACK",
            
            # Time operations
            "syscall.SYS_CLOCK_GETTIME",
            "syscall.SYS_GETTIMEOFDAY",
            "syscall.SYS_TIME",
            
            # Threading/synchronization
            "syscall.SYS_FUTEX",
            "syscall.SYS_SET_ROBUST_LIST",
            "syscall.SYS_GET_ROBUST_LIST",
            "syscall.SYS_CLONE",
            
            # System info
            "syscall.SYS_UNAME",
            "syscall.SYS_ARCH_PRCTL",
            "syscall.SYS_RSEQ",
            
            # I/O operations
            "syscall.SYS_IOCTL",
            "syscall.SYS_POLL",
            "syscall.SYS_SELECT",
            "syscall.SYS_PSELECT6",
            
            # Process scheduling
            "syscall.SYS_SCHED_YIELD",
            "syscall.SYS_SCHED_GETAFFINITY",
            
            # Additional Python runtime essentials
            "syscall.SYS_GETRANDOM",
            "syscall.SYS_GETCWD",
            "syscall.SYS_READLINK",
            "syscall.SYS_READLINKAT",
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
        # Only allow writing to stdout and stderr for output
        f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stdout.fileno()))
        f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stderr.fileno()))
        # Remove other write-related syscalls
        # f.add_rule(ALLOW, 307)  # Removed - might be file creation
        # f.add_rule(ALLOW, 318)  # Removed - might be file creation
        # f.add_rule(ALLOW, 334)  # Removed - might be file creation
        f.load()
    except ImportError:
        # seccomp module not available, skip security restrictions
        pass
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
    # Add file writing modules to the blacklist
    dangerous_modules = [
        "os", "sys", "subprocess", "shutil", "socket", "ctypes", 
        "multiprocessing", "threading", "pickle",
        # Additional modules that can write files
        "tempfile", "pathlib", "io", "fileinput"
    ]
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

def detect_file_write_operations(code):
    """Detect potential file writing operations in code"""
    dangerous_patterns = [
        'open(', 'file(', 'write(', 'writelines(',
        'with open', 'f.write', '.write(', 
        'create', 'mkdir', 'makedirs'
    ]
    
    for pattern in dangerous_patterns:
        if pattern in code:
            return f"File write operation detected: {pattern}"
    return None

def run_pythonCode(data:dict):
    if not data or "code" not in data:
        return {"error": "Invalid request format: missing code"}
    
    code = data.get("code")
    if not code or not code.strip():
        return {"error": "Code cannot be empty"}
    
    code = remove_print_statements(code)
    dangerous_import = detect_dangerous_imports(code)
    if dangerous_import:
        return {"error": f"Importing {dangerous_import} is not allowed."}
    
    # Check for file write operations
    write_operation = detect_file_write_operations(code)
    if write_operation:
        return {"error": f"File write operations are not allowed: {write_operation}"}
    
    # Handle variables - default to empty dict if not provided or None
    variables = data.get("variables", {})
    if variables is None:
        variables = {}
    
    imports = "\\n".join(extract_imports(code))
    var_def = ""
    
    # Process variables with proper validation
    for k, v in variables.items():
        if not isinstance(k, str) or not k.strip():
            return {"error": f"Invalid variable name: {repr(k)}"}
        
        # Use repr() to properly handle Python True/False/None values
        try:
            one_var = f"{k} = {repr(v)}\\n"
            var_def = var_def + one_var
        except Exception as e:
            return {"error": f"Error processing variable {k}: {str(e)}"}
    
    # Create a safe main function call with error handling
    output_code = '''if __name__ == '__main__':
    import inspect
    try:
        # Get main function signature
        sig = inspect.signature(main)
        params = list(sig.parameters.keys())
        
        # Create arguments dict from available variables
        available_vars = {''' + ', '.join([f'"{k}": {k}' for k in variables.keys()]) + '''}
        
        # Match parameters with available variables
        args = []
        kwargs = {}
        
        for param_name in params:
            if param_name in available_vars:
                args.append(available_vars[param_name])
            else:
                # Check if parameter has default value
                param = sig.parameters[param_name]
                if param.default is not inspect.Parameter.empty:
                    break  # Stop adding positional args, rest will use defaults
                else:
                    raise TypeError(f"main() missing required argument: '{param_name}'. Available variables: {list(available_vars.keys())}")
        
        # Call main function
        if args:
            res = main(*args)
        else:
            res = main()
            
        print(res)
    except Exception as e:
        print({"error": f"Error calling main function: {str(e)}"})
'''
    code = imports + "\\n" + seccomp_prefix + "\\n" + var_def + "\\n" + code + "\\n" + output_code
    
    # Note: We still need to create the subprocess file for execution,
    # but user code cannot write additional files
    tmp_file = os.path.join(data["tempDir"], "subProcess.py")
    with open(tmp_file, "w", encoding="utf-8") as f:
        f.write(code)
    try:
        result = subprocess.run(["python3", tmp_file], capture_output=True, text=True, timeout=10)
        if result.returncode == -31:
            return {"error": "Dangerous behavior detected (likely file write attempt)."}
        if result.stderr != "":
            return {"error": result.stderr}

        out = ast.literal_eval(result.stdout.strip())
        return out
    except subprocess.TimeoutExpired:
        return {"error": "Timeout error or blocked by system security policy"}
    except Exception as e:
        return {"error": str(e)}

`;
