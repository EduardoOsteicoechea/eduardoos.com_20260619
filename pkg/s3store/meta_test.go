package s3store

import "testing"

func TestIsImageContentType(t *testing.T) {
	if !IsImageContentType("image/png") {
		t.Fatal("expected image/png")
	}
	if IsImageContentType("application/pdf") {
		t.Fatal("expected non-image")
	}
}

func TestFormatSize(t *testing.T) {
	if FormatSize(512) != "512 B" {
		t.Fatalf("got %s", FormatSize(512))
	}
	if FormatSize(2048) != "2.0 KB" {
		t.Fatalf("got %s", FormatSize(2048))
	}
}

func TestToImageItemsFiltersNonImages(t *testing.T) {
	items := []ObjectMeta{
		{Key: "media/a.png", ContentType: "image/png", Size: 100, LastModified: "2026-01-01T00:00:00Z"},
		{Key: "media/readme.txt", ContentType: "text/plain", Size: 50},
	}
	images := ToImageItems(items)
	if len(images) != 1 || images[0].Name != "a.png" {
		t.Fatalf("unexpected filter result: %+v", images)
	}
}

func TestRelativeKey(t *testing.T) {
	got := RelativeKey("media", "media/favicon.svg")
	if got != "favicon.svg" {
		t.Fatalf("got %q", got)
	}
}

func TestS3ObjectURL(t *testing.T) {
	aws := S3ObjectURL("aws", "my-bucket", "us-east-1", "media/photo.png")
	if aws != "https://my-bucket.s3.us-east-1.amazonaws.com/media/photo.png" {
		t.Fatalf("aws url: %s", aws)
	}
	stub := S3ObjectURL("stub", "my-bucket", "us-east-1", "media/photo.png")
	if stub != "s3://my-bucket/media/photo.png" {
		t.Fatalf("stub url: %s", stub)
	}
}
