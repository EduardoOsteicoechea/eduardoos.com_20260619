package bim

import "testing"

func TestSanitizeLibraryName(t *testing.T) {
	got := sanitizeLibraryName("My Model (1)")
	if got != "My-Model-1.ifc" {
		t.Fatalf("got %q", got)
	}
	if sanitizeLibraryName("a") != "" {
		t.Fatal("single char should be invalid")
	}
	if sanitizeLibraryName("topo001") != "topo001.ifc" {
		t.Fatalf("topo001 → %q", sanitizeLibraryName("topo001"))
	}
	if sanitizeLibraryName("../bad") != "" && stringsHasDotDot(sanitizeLibraryName("../bad")) {
		t.Fatal("path escape")
	}
}

func stringsHasDotDot(s string) bool {
	return len(s) >= 2 && (s == ".." || len(s) > 2 && (s[:2] == ".." || s[len(s)-2:] == ".."))
}

func TestSanitizeIfcFilenameFallback(t *testing.T) {
	got := sanitizeIfcFilename("My Model (1).IFC")
	if got[len(got)-4:] != ".ifc" {
		t.Fatalf("sanitize=%q", got)
	}
}

func TestEnsureKeyUnderLibrary(t *testing.T) {
	key, ok := ensureKeyUnderLibrary("topo001.ifc")
	if !ok || key != "ifcbim/library/topo001.ifc" {
		t.Fatalf("basename: key=%q ok=%v", key, ok)
	}
	key, ok = ensureKeyUnderLibrary("ifcbim/library/a.ifc")
	if !ok || key != "ifcbim/library/a.ifc" {
		t.Fatalf("full: key=%q ok=%v", key, ok)
	}
	if _, ok := ensureKeyUnderLibrary("../etc/passwd.ifc"); ok {
		t.Fatal("expected reject ..")
	}
	if _, ok := ensureKeyUnderLibrary("ifcbim/other/a.ifc"); ok {
		t.Fatal("expected reject outside library")
	}
}
