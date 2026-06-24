//go:build linux && amd64

package sandbox

import "syscall"

const (
	sysGetrandom = 318
	sysRseq      = 334
	sysClone3    = 435
	sysSendmmsg  = 307
)

var allowBaseSyscalls = []int{
	syscall.SYS_READ, syscall.SYS_WRITE, syscall.SYS_CLOSE,
	syscall.SYS_NEWFSTATAT, syscall.SYS_FSTAT, syscall.SYS_FCNTL, syscall.SYS_IOCTL,
	syscall.SYS_OPENAT, syscall.SYS_FACCESSAT, syscall.SYS_PREAD64, syscall.SYS_LSEEK, syscall.SYS_GETDENTS64,
	// Python tempfile/matplotlib 需要在每个 task 临时目录内建目录；路径边界由 Python guard 和 chroot 权限控制。
	syscall.SYS_MKDIR, syscall.SYS_MKDIRAT,
	syscall.SYS_MMAP, syscall.SYS_MPROTECT, syscall.SYS_MUNMAP, syscall.SYS_BRK,
	syscall.SYS_MREMAP, syscall.SYS_MADVISE,
	syscall.SYS_RT_SIGACTION, syscall.SYS_RT_SIGPROCMASK, syscall.SYS_SIGALTSTACK, syscall.SYS_RT_SIGRETURN,
	syscall.SYS_CLOCK_GETTIME, syscall.SYS_GETTIMEOFDAY, syscall.SYS_NANOSLEEP, syscall.SYS_CLOCK_NANOSLEEP,
	syscall.SYS_GETPID, syscall.SYS_GETPPID, syscall.SYS_GETTID,
	syscall.SYS_GETUID, syscall.SYS_GETEUID, syscall.SYS_GETGID, syscall.SYS_GETEGID, syscall.SYS_GETGROUPS,
	syscall.SYS_GETCWD, syscall.SYS_UNAME, syscall.SYS_SETITIMER,
	syscall.SYS_SETGROUPS, syscall.SYS_SETGID, syscall.SYS_SETUID,
	syscall.SYS_FUTEX, syscall.SYS_SCHED_GETAFFINITY, syscall.SYS_SCHED_YIELD,
	syscall.SYS_EXIT, syscall.SYS_EXIT_GROUP, syscall.SYS_TGKILL,
	sysGetrandom, syscall.SYS_EVENTFD2,
	syscall.SYS_EPOLL_CREATE1, syscall.SYS_EPOLL_CTL, syscall.SYS_PSELECT6,
	syscall.SYS_SET_ROBUST_LIST, syscall.SYS_GET_ROBUST_LIST, sysRseq,
}

var errnoSyscalls = []int{
	syscall.SYS_CLONE, sysClone3, syscall.SYS_FORK, syscall.SYS_VFORK,
}

var allowNetworkSyscalls = []int{
	syscall.SYS_SOCKET, syscall.SYS_CONNECT, syscall.SYS_BIND, syscall.SYS_LISTEN, syscall.SYS_ACCEPT,
	syscall.SYS_SENDTO, syscall.SYS_RECVFROM, syscall.SYS_SENDMSG, sysSendmmsg, syscall.SYS_RECVMSG,
	syscall.SYS_GETSOCKNAME, syscall.SYS_GETPEERNAME, syscall.SYS_SETSOCKOPT, syscall.SYS_GETSOCKOPT,
	syscall.SYS_POLL, syscall.SYS_PPOLL, syscall.SYS_EPOLL_PWAIT,
}
