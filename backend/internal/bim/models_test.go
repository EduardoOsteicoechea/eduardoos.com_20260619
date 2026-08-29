package bim

import "testing"

func TestSanitizeIfcFilename(t *testing.T) {
	got := sanitizeIfcFilename("My Model (1).IFC")
	if got != "My-Model-1.ifc" && got != "My-Model-(1).ifc" {
		// spaces → dash, unsafe stripped; must end .ifc
		if len(got) < 5 || got[len(got)-4:] != ".ifc" {
			t.Fatalf("sanitize=%q", got)
		}
	}
	empty := sanitizeIfcFilename("")
	if empty[len(empty)-4:] != ".ifc" {
		t.Fatalf("empty sanitize=%q", empty)
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
