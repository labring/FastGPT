//go:build !linux

package sandbox

import "fmt"

type Config struct {
	UID           int
	GID           int
	EnableNetwork bool
	EnableSeccomp bool
}

func Init(config Config) error {
	return fmt.Errorf("fastgpt python sandbox native isolation only supports linux")
}
