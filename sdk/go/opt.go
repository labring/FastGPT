package fastgpt

import (
	"bytes"
	"encoding/json"
	"errors"
)

// Opt represents a tri-state optional JSON field that distinguishes between
// unset (omitted), explicit JSON null, and a present value (including zero values).
//
// Struct fields using Opt[T] should include the Go 1.24 `omitzero` JSON tag
// option so unset fields are omitted while explicit zero values and null are kept.
type Opt[T any] struct {
	value   T
	present bool
	null    bool
}

// IsZero reports whether the field is unset (omitted).
func (o Opt[T]) IsZero() bool {
	return !o.present
}

// IsPresent reports whether a value or explicit null has been set.
func (o Opt[T]) IsPresent() bool {
	return o.present
}

// IsNull reports whether the field was explicitly set to null.
func (o Opt[T]) IsNull() bool {
	return o.present && o.null
}

// Value returns the wrapped value, or the zero value of T if unset or null.
func (o Opt[T]) Value() T {
	if !o.present || o.null {
		var zero T
		return zero
	}
	return o.value
}

// Get returns the wrapped value and true when a non-null value is present,
// or the zero value of T and false when unset or null.
func (o Opt[T]) Get() (T, bool) {
	if !o.present || o.null {
		var zero T
		return zero, false
	}
	return o.value, true
}

// Or returns the wrapped value when a non-null value is present, otherwise fallback.
func (o Opt[T]) Or(fallback T) T {
	if o.present && !o.null {
		return o.value
	}
	return fallback
}

// MarshalJSON encodes unset or explicit null values as JSON null,
// and concrete values using encoding/json.
func (o Opt[T]) MarshalJSON() ([]byte, error) {
	if !o.present || o.null {
		return []byte("null"), nil
	}
	return json.Marshal(o.value)
}

// UnmarshalJSON decodes JSON null as Null[T]() and any non-null JSON value as Some(v).
func (o *Opt[T]) UnmarshalJSON(data []byte) error {
	if o == nil {
		return errors.New("fastgpt.Opt: UnmarshalJSON on nil pointer")
	}
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		*o = Null[T]()
		return nil
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	*o = Some(v)
	return nil
}

// Some constructs an Opt[T] containing a present non-null value.
func Some[T any](v T) Opt[T] {
	return Opt[T]{
		value:   v,
		present: true,
	}
}

// Null constructs an Opt[T] representing an explicit JSON null.
func Null[T any]() Opt[T] {
	return Opt[T]{
		present: true,
		null:    true,
	}
}

// String constructs a present Opt[string].
func String(v string) Opt[string] {
	return Some(v)
}

// Bool constructs a present Opt[bool].
func Bool(v bool) Opt[bool] {
	return Some(v)
}

// Int constructs a present Opt[int].
func Int(v int) Opt[int] {
	return Some(v)
}

// Int64 constructs a present Opt[int64].
func Int64(v int64) Opt[int64] {
	return Some(v)
}

// Float64 constructs a present Opt[float64].
func Float64(v float64) Opt[float64] {
	return Some(v)
}
