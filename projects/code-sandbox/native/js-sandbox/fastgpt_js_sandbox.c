#define _GNU_SOURCE

#include <errno.h>
#include <grp.h>
#include <node_api.h>
#include <seccomp.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <unistd.h>

static napi_value throw_errno(napi_env env, const char *operation) {
  char message[256];
  snprintf(message, sizeof(message), "%s: %s", operation, strerror(errno));
  napi_throw_error(env, NULL, message);
  return NULL;
}

static bool read_int32_property(napi_env env, napi_value object, const char *name,
                                int32_t *result) {
  napi_value value;
  if (napi_get_named_property(env, object, name, &value) != napi_ok) return false;
  return napi_get_value_int32(env, value, result) == napi_ok;
}

static bool read_bool_property(napi_env env, napi_value object, const char *name,
                               bool *result) {
  napi_value value;
  if (napi_get_named_property(env, object, name, &value) != napi_ok) return false;
  return napi_get_value_bool(env, value, result) == napi_ok;
}

static bool read_string_property(napi_env env, napi_value object, const char *name,
                                 char *result, size_t result_size) {
  napi_value value;
  size_t copied = 0;
  if (napi_get_named_property(env, object, name, &value) != napi_ok) return false;
  if (napi_get_value_string_utf8(env, value, result, result_size, &copied) != napi_ok) {
    return false;
  }
  return copied > 0 && copied < result_size;
}

static int allow_syscall(scmp_filter_ctx filter, const char *name) {
  int syscall_number = seccomp_syscall_resolve_name(name);
  if (syscall_number == __NR_SCMP_ERROR) return 0;
  return seccomp_rule_add(filter, SCMP_ACT_ALLOW, syscall_number, 0);
}

static int install_seccomp(void) {
  static const char *const allowed_syscalls[] = {
      "read",          "write",          "readv",          "writev",
      "close",         "fstat",          "newfstatat",      "statx",
      "fcntl",         "ioctl",          "lseek",          "pread64",
      "openat",        "faccessat",      "faccessat2",     "readlinkat",
      "getdents64",    "mmap",           "mprotect",       "munmap",
      "mremap",        "madvise",        "brk",            "rt_sigaction",
      "rt_sigprocmask", "rt_sigreturn",   "sigaltstack",    "clock_gettime",
      "gettimeofday",  "nanosleep",      "clock_nanosleep", "getpid",
      "getppid",       "gettid",         "getuid",         "geteuid",
      "getgid",        "getegid",        "getgroups",      "getcwd",
      "uname",         "futex",          "sched_getaffinity", "sched_yield",
      "getrandom",     "eventfd2",       "epoll_create1",  "epoll_ctl",
      "epoll_wait",    "epoll_pwait",    "pselect6",       "poll",
      "ppoll",         "set_robust_list", "get_robust_list", "rseq",
      "prlimit64",     "exit",           "exit_group"};

  scmp_filter_ctx filter = seccomp_init(SCMP_ACT_ERRNO(EPERM));
  if (filter == NULL) return -1;

  int rc = seccomp_attr_set(filter, SCMP_FLTATR_CTL_TSYNC, 1);
  if (rc < 0) {
    seccomp_release(filter);
    errno = -rc;
    return -1;
  }

  for (size_t i = 0; i < sizeof(allowed_syscalls) / sizeof(allowed_syscalls[0]); i++) {
    rc = allow_syscall(filter, allowed_syscalls[i]);
    if (rc < 0) {
      seccomp_release(filter);
      errno = -rc;
      return -1;
    }
  }

  rc = seccomp_load(filter);
  seccomp_release(filter);
  if (rc < 0) {
    errno = -rc;
    return -1;
  }
  return 0;
}

/** Enter the process-wide chroot/credential/seccomp boundary exactly once. */
static napi_value init_sandbox(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_value undefined;
  int32_t uid = 0;
  int32_t gid = 0;
  bool enable_seccomp = true;
  char cwd[256] = "/app/code-sandbox";

  napi_get_undefined(env, &undefined);
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 1 ||
      !read_int32_property(env, argv[0], "uid", &uid) ||
      !read_int32_property(env, argv[0], "gid", &gid)) {
    napi_throw_type_error(env, NULL, "init requires { uid, gid, cwd? }");
    return NULL;
  }
  napi_value cwd_value;
  bool has_cwd = false;
  if (napi_has_named_property(env, argv[0], "cwd", &has_cwd) == napi_ok && has_cwd &&
      napi_get_named_property(env, argv[0], "cwd", &cwd_value) == napi_ok) {
    if (!read_string_property(env, argv[0], "cwd", cwd, sizeof(cwd))) {
      napi_throw_type_error(env, NULL, "cwd must be a non-empty string");
      return NULL;
    }
  }
  if (uid <= 0 || gid <= 0) {
    napi_throw_range_error(env, NULL, "uid/gid must be positive");
    return NULL;
  }
  bool has_enable_seccomp = false;
  if (napi_has_named_property(env, argv[0], "enableSeccomp", &has_enable_seccomp) == napi_ok &&
      has_enable_seccomp &&
      !read_bool_property(env, argv[0], "enableSeccomp", &enable_seccomp)) {
    napi_throw_type_error(env, NULL, "enableSeccomp must be a boolean");
    return NULL;
  }

  if (chroot(".") != 0) return throw_errno(env, "chroot");
  if (chdir(cwd) != 0) return throw_errno(env, "chdir");
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) return throw_errno(env, "no_new_privs");
  if (setgroups(0, NULL) != 0) return throw_errno(env, "setgroups");
  if (setresgid(gid, gid, gid) != 0) return throw_errno(env, "setresgid");
  if (setresuid(uid, uid, uid) != 0) return throw_errno(env, "setresuid");
  if (getuid() != (uid_t)uid || geteuid() != (uid_t)uid || getgid() != (gid_t)gid ||
      getegid() != (gid_t)gid) {
    napi_throw_error(env, NULL, "credential verification failed");
    return NULL;
  }
  // Credential changes may reset dumpable; enforce and verify it after the final UID/GID switch.
  if (prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0) return throw_errno(env, "dumpable");
  if (prctl(PR_GET_DUMPABLE, 0, 0, 0, 0) != 0) {
    napi_throw_error(env, NULL, "dumpable verification failed");
    return NULL;
  }
  if (enable_seccomp && install_seccomp() != 0) return throw_errno(env, "seccomp");

  return undefined;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value init;
  if (napi_create_function(env, "init", NAPI_AUTO_LENGTH, init_sandbox, NULL, &init) != napi_ok) {
    return NULL;
  }
  if (napi_set_named_property(env, exports, "init", init) != napi_ok) return NULL;
  return exports;
}

NAPI_MODULE(fastgpt_js_sandbox, initialize)
