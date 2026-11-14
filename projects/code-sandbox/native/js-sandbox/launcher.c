#define _GNU_SOURCE
#include <errno.h>
#include <seccomp.h>
#include <stdio.h>
#include <sys/prctl.h>
#include <unistd.h>

/**
 * 在 exec Node 前禁止 io_uring，使所有 libuv loop 从初始化起使用 epoll。
 * 此处不能提前安装完整白名单：Node 仍需加载模块和创建运行时线程；worker
 * 预加载结束后由原版 addon 完成 chroot、降权与 TSYNC default-deny 隔离。
 */
int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "Usage: fastgpt_js_launcher <runtime> [args...]\n");
    return 2;
  }
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    perror("JS launcher: no_new_privs");
    return 1;
  }

  scmp_filter_ctx filter = seccomp_init(SCMP_ACT_ALLOW);
  if (filter == NULL) {
    fprintf(stderr, "JS launcher: seccomp_init failed\n");
    return 1;
  }
  const char *const names[] = {"io_uring_setup", "io_uring_enter", "io_uring_register"};
  for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++) {
    int nr = seccomp_syscall_resolve_name(names[i]);
    // 未识别的 syscall 不能静默忽略，否则可能在新内核上留下可用的 ring。
    if (nr == __NR_SCMP_ERROR ||
        seccomp_rule_add(filter, SCMP_ACT_ERRNO(ENOSYS), nr, 0) < 0) {
      fprintf(stderr, "JS launcher: cannot block %s\n", names[i]);
      seccomp_release(filter);
      return 1;
    }
  }
  int rc = seccomp_load(filter);
  seccomp_release(filter);
  if (rc < 0) {
    errno = -rc;
    perror("JS launcher: seccomp_load");
    return 1;
  }

  // filter 跨 exec 保留，并由 Node 后续创建的线程继承；不影响可信父进程。
  execvp(argv[1], argv + 1);
  perror("JS launcher: execvp");
  return 1;
}
