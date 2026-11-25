package fastgpt

import (
	"encoding/json"
	"testing"
)

type optSampleNested struct {
	Label string `json:"label,omitempty"`
}

type optSamplePayload struct {
	Text   Opt[string]          `json:"text,omitzero"`
	Flag   Opt[bool]            `json:"flag,omitzero"`
	Count  Opt[int]             `json:"count,omitzero"`
	Big    Opt[int64]           `json:"big,omitzero"`
	Score  Opt[float64]         `json:"score,omitzero"`
	Nested Opt[optSampleNested] `json:"nested,omitzero"`
}

func TestOptStatesAndAccessors(t *testing.T) {
	var unset Opt[string]
	if !unset.IsZero() {
		t.Fatal("unset.IsZero() = false, want true")
	}
	if unset.IsPresent() {
		t.Fatal("unset.IsPresent() = true, want false")
	}
	if unset.IsNull() {
		t.Fatal("unset.IsNull() = true, want false")
	}
	if got := unset.Value(); got != "" {
		t.Fatalf("unset.Value() = %q, want empty", got)
	}
	if got, ok := unset.Get(); ok || got != "" {
		t.Fatalf("unset.Get() = (%q, %v), want (\"\", false)", got, ok)
	}
	if got := unset.Or("fallback"); got != "fallback" {
		t.Fatalf("unset.Or() = %q, want \"fallback\"", got)
	}

	explicitNull := Null[string]()
	if explicitNull.IsZero() {
		t.Fatal("Null.IsZero() = true, want false")
	}
	if !explicitNull.IsPresent() {
		t.Fatal("Null.IsPresent() = false, want true")
	}
	if !explicitNull.IsNull() {
		t.Fatal("Null.IsNull() = false, want true")
	}
	if got := explicitNull.Value(); got != "" {
		t.Fatalf("Null.Value() = %q, want empty", got)
	}
	if got, ok := explicitNull.Get(); ok || got != "" {
		t.Fatalf("Null.Get() = (%q, %v), want (\"\", false)", got, ok)
	}
	if got := explicitNull.Or("fallback"); got != "fallback" {
		t.Fatalf("Null.Or() = %q, want \"fallback\"", got)
	}

	emptyStr := String("")
	if emptyStr.IsZero() {
		t.Fatal("String(\"\").IsZero() = true, want false")
	}
	if !emptyStr.IsPresent() || emptyStr.IsNull() {
		t.Fatalf("String(\"\") present=%v null=%v, want true/false", emptyStr.IsPresent(), emptyStr.IsNull())
	}
	if got, ok := emptyStr.Get(); !ok || got != "" {
		t.Fatalf("String(\"\").Get() = (%q, %v), want (\"\", true)", got, ok)
	}
	if got := emptyStr.Or("fallback"); got != "" {
		t.Fatalf("String(\"\").Or() = %q, want \"\"", got)
	}

	if got, ok := Bool(false).Get(); !ok || got {
		t.Fatalf("Bool(false).Get() = (%v, %v), want (false, true)", got, ok)
	}
	if got := Bool(false).Or(true); got {
		t.Fatalf("Bool(false).Or(true) = %v, want false", got)
	}
	if got, ok := Int(0).Get(); !ok || got != 0 {
		t.Fatalf("Int(0).Get() = (%d, %v), want (0, true)", got, ok)
	}
	if got := Int(0).Or(7); got != 0 {
		t.Fatalf("Int(0).Or(7) = %d, want 0", got)
	}
	if got, ok := Int64(0).Get(); !ok || got != 0 {
		t.Fatalf("Int64(0).Get() = (%d, %v), want (0, true)", got, ok)
	}
	if got, ok := Float64(0).Get(); !ok || got != 0 {
		t.Fatalf("Float64(0).Get() = (%v, %v), want (0, true)", got, ok)
	}
}

func TestOptMarshalJSONOmitzero(t *testing.T) {
	tests := []struct {
		name    string
		payload optSamplePayload
		want    string
	}{
		{
			name:    "all unset omitted",
			payload: optSamplePayload{},
			want:    `{}`,
		},
		{
			name: "zero values preserved",
			payload: optSamplePayload{
				Text:   String(""),
				Flag:   Bool(false),
				Count:  Int(0),
				Big:    Int64(0),
				Score:  Float64(0),
				Nested: Some(optSampleNested{}),
			},
			want: `{"text":"","flag":false,"count":0,"big":0,"score":0,"nested":{}}`,
		},
		{
			name: "explicit nulls preserved",
			payload: optSamplePayload{
				Text:   Null[string](),
				Flag:   Null[bool](),
				Count:  Null[int](),
				Big:    Null[int64](),
				Score:  Null[float64](),
				Nested: Null[optSampleNested](),
			},
			want: `{"text":null,"flag":null,"count":null,"big":null,"score":null,"nested":null}`,
		},
		{
			name: "non-zero values",
			payload: optSamplePayload{
				Text:   String("fastgpt"),
				Flag:   Bool(true),
				Count:  Int(42),
				Big:    Int64(9001),
				Score:  Float64(1.5),
				Nested: Some(optSampleNested{Label: "v1"}),
			},
			want: `{"text":"fastgpt","flag":true,"count":42,"big":9001,"score":1.5,"nested":{"label":"v1"}}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := json.Marshal(tc.payload)
			if err != nil {
				t.Fatalf("json.Marshal() error = %v", err)
			}
			if string(got) != tc.want {
				t.Fatalf("json.Marshal() = %s, want %s", got, tc.want)
			}
		})
	}

	// Direct marshaling of an unset Opt[T] outside omitzero produces JSON null.
	var directUnset Opt[string]
	raw, err := json.Marshal(directUnset)
	if err != nil {
		t.Fatalf("json.Marshal(directUnset) error = %v", err)
	}
	if string(raw) != "null" {
		t.Fatalf("json.Marshal(directUnset) = %s, want null", raw)
	}
}

func TestOptUnmarshalJSONRoundTrip(t *testing.T) {
	input := `{
		"flag": false,
		"count": 0,
		"big": 1234567890123,
		"score": null,
		"nested": {"label": "ok"}
	}`

	var decoded optSamplePayload
	if err := json.Unmarshal([]byte(input), &decoded); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	// Omitted field remains unset.
	if !decoded.Text.IsZero() || decoded.Text.IsPresent() || decoded.Text.IsNull() {
		t.Fatalf("decoded.Text = present:%v null:%v, want unset", decoded.Text.IsPresent(), decoded.Text.IsNull())
	}
	// Present zero values remain present and non-null.
	if v, ok := decoded.Flag.Get(); !ok || v {
		t.Fatalf("decoded.Flag.Get() = (%v, %v), want (false, true)", v, ok)
	}
	if v, ok := decoded.Count.Get(); !ok || v != 0 {
		t.Fatalf("decoded.Count.Get() = (%d, %v), want (0, true)", v, ok)
	}
	if v, ok := decoded.Big.Get(); !ok || v != 1234567890123 {
		t.Fatalf("decoded.Big.Get() = (%d, %v), want (1234567890123, true)", v, ok)
	}
	// Explicit null is present and null.
	if decoded.Score.IsZero() || !decoded.Score.IsPresent() || !decoded.Score.IsNull() {
		t.Fatalf("decoded.Score = present:%v null:%v, want explicit null", decoded.Score.IsPresent(), decoded.Score.IsNull())
	}
	if v, ok := decoded.Score.Get(); ok || v != 0 {
		t.Fatalf("decoded.Score.Get() = (%v, %v), want (0, false)", v, ok)
	}
	if v, ok := decoded.Nested.Get(); !ok || v.Label != "ok" {
		t.Fatalf("decoded.Nested.Get() = (%+v, %v), want ({Label:ok}, true)", v, ok)
	}

	// Re-marshal preserves omitted vs zero vs null vs value.
	remarshaled, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("json.Marshal(decoded) error = %v", err)
	}
	want := `{"flag":false,"count":0,"big":1234567890123,"score":null,"nested":{"label":"ok"}}`
	if string(remarshaled) != want {
		t.Fatalf("round-trip json = %s, want %s", remarshaled, want)
	}

	// Unmarshaling null into a previously populated Opt resets its value.
	populated := String("stale")
	if err := populated.UnmarshalJSON([]byte("  null \n")); err != nil {
		t.Fatalf("UnmarshalJSON(null) error = %v", err)
	}
	if !populated.IsNull() || populated.Value() != "" {
		t.Fatalf("after null UnmarshalJSON: isNull=%v value=%q, want true/\"\"", populated.IsNull(), populated.Value())
	}

	// Type mismatch returns an error without overwriting existing value.
	num := Int(99)
	if err := json.Unmarshal([]byte(`"not-an-int"`), &num); err == nil {
		t.Fatal("expected error when unmarshaling string into Opt[int]")
	}
	if v, ok := num.Get(); !ok || v != 99 {
		t.Fatalf("num after failed unmarshal = (%d, %v), want (99, true)", v, ok)
	}

	// Nil receiver check.
	var nilOpt *Opt[string]
	if err := nilOpt.UnmarshalJSON([]byte(`"x"`)); err == nil {
		t.Fatal("expected error for nil *Opt[string].UnmarshalJSON")
	}
}
