//go:build linux

package sandbox

import (
	"fmt"
	"syscall"
)

// Init installs the OS-level restrictions for the current Python process.
//
// The caller must load this shared library, open all required task fds, and set
// cwd to the prepared sandbox root before calling Init. After chroot/seccomp and
// uid/gid drop, the process cannot recover its previous privileges.
func Init(uid, gid int, enableNetwork bool) error {
	if uid <= 0 || gid <= 0 {
		return fmt.Errorf("uid/gid must be positive")
	}
	if err := syscall.Chroot("."); err != nil {
		return fmt.Errorf("chroot: %w", err)
	}
	if err := syscall.Chdir("/"); err != nil {
		return fmt.Errorf("chdir: %w", err)
	}
	if err := setNoNewPrivs(); err != nil {
		return err
	}
	if err := loadSeccomp(enableNetwork); err != nil {
		return err
	}
	if err := syscall.Setgroups([]int{}); err != nil {
		return fmt.Errorf("setgroups: %w", err)
	}
	if err := syscall.Setgid(gid); err != nil {
		return fmt.Errorf("setgid: %w", err)
	}
	if err := syscall.Setuid(uid); err != nil {
		return fmt.Errorf("setuid: %w", err)
	}
	return nil
}
