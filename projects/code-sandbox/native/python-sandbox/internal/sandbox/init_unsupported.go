//go:build !linux

package sandbox

import "fmt"

func Init(uid, gid int, enableNetwork bool) error {
	return fmt.Errorf("fastgpt python sandbox native isolation only supports linux")
}
