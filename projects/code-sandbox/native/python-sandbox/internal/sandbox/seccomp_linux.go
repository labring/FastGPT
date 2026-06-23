//go:build linux

package sandbox

import (
	"fmt"
	"syscall"

	seccomp "github.com/seccomp/libseccomp-golang"
)

func loadSeccomp(enableNetwork bool) error {
	filter, err := seccomp.NewFilter(seccomp.ActErrno.SetReturnCode(int16(syscall.EPERM)))
	if err != nil {
		return fmt.Errorf("create seccomp filter: %w", err)
	}

	for _, syscallID := range allowBaseSyscalls {
		if err := filter.AddRule(seccomp.ScmpSyscall(syscallID), seccomp.ActAllow); err != nil {
			return fmt.Errorf("allow syscall %d: %w", syscallID, err)
		}
	}

	if enableNetwork {
		for _, syscallID := range allowNetworkSyscalls {
			if err := filter.AddRule(seccomp.ScmpSyscall(syscallID), seccomp.ActAllow); err != nil {
				return fmt.Errorf("allow network syscall %d: %w", syscallID, err)
			}
		}
	}

	if err := filter.Load(); err != nil {
		return fmt.Errorf("load seccomp filter: %w", err)
	}
	return nil
}
