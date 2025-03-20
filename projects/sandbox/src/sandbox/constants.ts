export const seccompPrefix = `
from seccomp import *
import sys
import json
import numpy
import pandas
def type_converter(obj):
    if isinstance(obj, numpy.integer):
        return int(obj)
    elif isinstance(obj, numpy.floating):
        return float(obj)
    elif isinstance(obj, numpy.ndarray):
        return obj.tolist()
    elif isinstance(obj, pandas.Series):
        return obj.to_list()
    elif isinstance(obj, pandas.DataFrame):
        return obj.to_dict(orient="records")
    return obj

allowed_syscalls = [
    "syscall.SYS_FUTEX",
    "syscall.SYS_MMAP", "syscall.SYS_BRK", "syscall.SYS_MPROTECT", "syscall.SYS_MUNMAP", "syscall.SYS_MREMAP", "syscall.SYS_RT_SIGRETURN",
    "syscall.SYS_SETUID", "syscall.SYS_SETGID", "syscall.SYS_GETUID",
    "syscall.SYS_GETPID", "syscall.SYS_GETPPID", "syscall.SYS_GETTID", 
    "syscall.SYS_EXIT", "syscall.SYS_EXIT_GROUP", "syscall.SYS_TGKILL", "syscall.SYS_RT_SIGACTION", 
    "syscall.SYS_IOCTL", "syscall.SYS_SCHED_YIELD", "syscall.SYS_SET_ROBUST_LIST", 
    "syscall.SYS_GET_ROBUST_LIST","syscall.SYS_RSEQ",
    "syscall.SYS_CLOCK_GETTIME", "syscall.SYS_GETTIMEOFDAY", "syscall.SYS_NANOSLEEP", "syscall.SYS_EPOLL_CREATE1", 
    "syscall.SYS_EPOLL_CTL", "syscall.SYS_CLOCK_NANOSLEEP", "syscall.SYS_PSELECT6", 
    "syscall.SYS_TIME",
    "syscall.SYS_RT_SIGPROCMASK", "syscall.SYS_SIGALTSTACK",
    "syscall.SYS_CLONE", "syscall.SYS_MKDIRAT", "syscall.SYS_MKDIR"
]
allowed_syscalls_tmp = allowed_syscalls
L = []
for item in allowed_syscalls_tmp:
    item = item.strip()
    parts = item.split('.')[1][4:].lower()
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
`;
