//go:build linux

package sandbox

import (
	"fmt"
	"syscall"
)

// Config controls the OS-level restrictions installed for one Python process.
type Config struct {
	UID           int
	GID           int
	EnableNetwork bool
	EnableSeccomp bool
}

// Init installs the OS-level restrictions for the current Python process.
//
// The caller must load this shared library, open all required task fds, and set
// cwd to the prepared sandbox root before calling Init. After chroot and uid/gid
// drop, the process cannot recover its previous privileges. Seccomp is skipped only
// when the operator explicitly disables it for an incompatible kernel.
func Init(config Config) error {
	if config.UID <= 0 || config.GID <= 0 {
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
	if config.EnableSeccomp {
		if err := loadSeccomp(config.EnableNetwork); err != nil {
			return err
		}
	}
	if err := syscall.Setgroups([]int{}); err != nil {
		return fmt.Errorf("setgroups: %w", err)
	}
	if err := syscall.Setgid(config.GID); err != nil {
		return fmt.Errorf("setgid: %w", err)
	}
	if err := syscall.Setuid(config.UID); err != nil {
		return fmt.Errorf("setuid: %w", err)
	}
	return nil
}
