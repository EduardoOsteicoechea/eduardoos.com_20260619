package latin

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

type fakeS3 struct {
	objects map[string]string
}

func (f *fakeS3) GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	_ = ctx
	_ = optFns
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	body, ok := f.objects[key]
	if !ok {
		return nil, fmtErr("NoSuchKey: " + key)
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(strings.NewReader(body)),
	}, nil
}

type simpleErr string

func (e simpleErr) Error() string { return string(e) }
func fmtErr(s string) error       { return simpleErr(s) }

func vol(n int) *int { return &n }

func TestIndexBuildsOrderedChapterOutline(t *testing.T) {
	fullIndex := `{
  "schemaVersion": 1,
  "sourceSha256": "abc",
  "sectionCount": 10,
  "sections": [
    {"id":"section-0001","order":1,"volume":1,"heading":"CHAP.I.]CHRISTIANRELIGION.","url":"sections/0001.json"},
    {"id":"section-0305","order":305,"volume":2,"heading":"VOLUME 2 — PRELIMINARY MATERIAL","url":"sections/0305.json"},
    {"id":"section-0306","order":306,"volume":2,"heading":"LIBER TERTIUS.","url":"sections/0306.json"},
    {"id":"section-0307","order":307,"volume":2,"heading":"CAPUT XI.","url":"sections/0307.json"},
    {"id":"section-0308","order":308,"volume":2,"heading":"CAPUT XII.","url":"sections/0308.json"},
    {"id":"section-0309","order":309,"volume":2,"heading":"CAPUT XIII.","url":"sections/0309.json"},
    {"id":"section-0310","order":310,"volume":2,"heading":"CAPUT XIV.","url":"sections/0310.json"},
    {"id":"section-0313","order":313,"volume":2,"heading":"CAPUT XIY.","url":"sections/0313.json"},
    {"id":"section-0339","order":339,"volume":2,"heading":"LIBER QUARTUS,","url":"sections/0339.json"},
    {"id":"section-0340","order":340,"volume":2,"heading":"ARGUMENTUM.","url":"sections/0340.json"},
    {"id":"section-0341","order":341,"volume":2,"heading":"CAPUT I.","url":"sections/0341.json"},
    {"id":"section-0342","order":342,"volume":2,"heading":"LIBER IV. DE EXTERNIS MEDIIS AD SALUTEM.","url":"sections/0342.json"},
    {"id":"section-0343","order":343,"volume":2,"heading":"CAPUT I.","url":"sections/0343.json"},
    {"id":"section-0344","order":344,"volume":2,"heading":"CAPUT X.","url":"sections/0344.json"},
    {"id":"section-0345","order":345,"volume":2,"heading":"CAPUT I.","url":"sections/0345.json"},
    {"id":"section-0351","order":351,"volume":2,"heading":"CAPUT II.","url":"sections/0351.json"},
    {"id":"section-0357","order":357,"volume":2,"heading":"CAPUT III.","url":"sections/0357.json"},
    {"id":"section-0361","order":361,"volume":2,"heading":"CAPUT IV.","url":"sections/0361.json"},
    {"id":"section-0366","order":366,"volume":2,"heading":"CAPUT V.","url":"sections/0366.json"},
    {"id":"section-0372","order":372,"volume":2,"heading":"CAPUT VI.","url":"sections/0372.json"},
    {"id":"section-0374","order":374,"volume":2,"heading":"CAPUT VII.","url":"sections/0374.json"},
    {"id":"section-0383","order":383,"volume":2,"heading":"CAPUT VIII.","url":"sections/0383.json"},
    {"id":"section-0386","order":386,"volume":2,"heading":"CAPUT IX.","url":"sections/0386.json"},
    {"id":"section-0391","order":391,"volume":2,"heading":"CAPUT X.","url":"sections/0391.json"}
  ]
}`
	h := &Handler{
		Bucket: "test-bucket",
		Prefix: "calvin-institutes",
		S3: &fakeS3{objects: map[string]string{
			"calvin-institutes/index.json":         fullIndex,
			"calvin-institutes/sections/0307.json": `{"id":"section-0307","heading":"CAPUT XI.","text":"xi"}`,
			"calvin-institutes/sections/0001.json": `{"id":"section-0001","heading":"English","text":"Body"}`,
		}},
	}
	r := chi.NewRouter()
	h.Routes(r)

	idx := httptest.NewRecorder()
	r.ServeHTTP(idx, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes", nil))
	if idx.Code != http.StatusOK {
		t.Fatalf("index status=%d body=%s", idx.Code, idx.Body.String())
	}
	var parsed institutesIndex
	if err := json.Unmarshal(idx.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, idx.Body.String())
	}

	wantHeadings := []string{
		"Caput XI — De iustificatione fidei, ac primo de ipsa nominis et rei definitione",
		"Caput XII — Ut serio nobis persuadeatur gratuita iustificatio, ad Dei tribunal tollendas esse mentes",
		"Caput XIII — Duo esse in gratuita iustificatione observanda",
		"Caput XIV — Quale initium iustificationis et continui progressus",
		"Liber IV · Argumentum — De externis mediis vel adminiculis",
		"Caput I — De vera Ecclesia, cum qua nobis colenda est unitas: quia piorum omnium mater est",
		"Caput II — Comparatio falsae Ecclesiae cum vera",
		"Caput III — De Ecclesiae doctoribus et ministris, eorum electione et officio",
		"Caput IV — De statu veteris Ecclesiae et ratione gubernandi quae in usu fuit ante Papatum",
		"Caput V — Antiquam regiminis formam omnino pessundatam fuisse tyrannide Papatus",
		"Caput VI — De primatu Romanae sedis",
		"Caput VII — De exordio et incrementis Romani Papatus, donec se in hanc altitudinem extulit qua et Ecclesiae libertas oppressa, et omnis moderatio eversa fuit",
		"Caput VIII — De potestate Ecclesiae quoad fidei dogmata: et quam effraeni licentia ad vitiandam omnem doctrinae puritatem tracta fuerit in Papatu",
		"Caput IX — De Conciliis, eorumque authoritate",
		"Caput X — De potestate in legibus ferendis, in qua saevissimam tyrannidem in animas et carnificinam exercuit Papa cum suis",
	}
	if len(parsed.Sections) != len(wantHeadings) {
		t.Fatalf("got %d sections %#v", len(parsed.Sections), headingsOf(parsed.Sections))
	}
	for i, want := range wantHeadings {
		if parsed.Sections[i].Heading != want {
			t.Fatalf("section[%d]=%q want %q; all=%v", i, parsed.Sections[i].Heading, want, headingsOf(parsed.Sections))
		}
	}
	// Caput XIV collapses OCR XIY page into pages[].
	xiv := parsed.Sections[3]
	if len(xiv.Pages) != 2 {
		t.Fatalf("XIV pages=%v", xiv.Pages)
	}
	// Caput I absorbs noisy Caput X running header page.
	capI := parsed.Sections[5]
	if len(capI.Pages) < 3 {
		t.Fatalf("Caput I should absorb noise pages, got %v", capI.Pages)
	}
	if bytes.Contains(idx.Body.Bytes(), []byte("CHRISTIANRELIGION")) {
		t.Fatal("english leaked")
	}

	sec := httptest.NewRecorder()
	r.ServeHTTP(sec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/307", nil))
	if sec.Code != http.StatusOK {
		t.Fatalf("section status=%d", sec.Code)
	}
}

func headingsOf(sections []institutesIndexEntry) []string {
	out := make([]string, len(sections))
	for i, s := range sections {
		out[i] = s.Heading
	}
	return out
}

func TestNormalizeRomanOCR(t *testing.T) {
	cases := map[string]string{
		"XIY": "XIV", "XY": "XV", "XXTIT": "XXIII", "xxiil": "XXIII", "in": "III", "IY": "IV", "VIL": "VII",
	}
	for in, want := range cases {
		if got := normalizeRomanOCR(in); got != want {
			t.Fatalf("%q → %q want %q", in, got, want)
		}
	}
}

func TestIsLatinIndexEntry(t *testing.T) {
	v1, v2 := 1, 2
	if isLatinIndexEntry(institutesIndexEntry{Volume: &v1, Heading: "CHAP.I."}) {
		t.Fatal("v1")
	}
	if isLatinIndexEntry(institutesIndexEntry{Volume: &v2, Heading: "VOLUME 2 — PRELIMINARY MATERIAL"}) {
		t.Fatal("prelim")
	}
	if !isLatinIndexEntry(institutesIndexEntry{Volume: &v2, Heading: "LIBER TERTIUS."}) {
		t.Fatal("liber")
	}
}

func TestNormalizeSectionID(t *testing.T) {
	n, err := normalizeSectionID("section-12")
	if err != nil || n != "0012" {
		t.Fatalf("got %q %v", n, err)
	}
	if _, err := normalizeSectionID("abc"); err == nil {
		t.Fatal("expected error")
	}
}
