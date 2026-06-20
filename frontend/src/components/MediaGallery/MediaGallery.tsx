/**
 * MediaGallery.tsx — Lists S3 media metadata and renders a fixed-size image grid.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchMediaImages,
  formatMediaDate,
  sortImagesByName,
  type MediaImage,
} from "../../lib/media";
import "./MediaGallery.css";

function MediaGallery() {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [bucket, setBucket] = useState("");
  const [backend, setBackend] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchMediaImages();
      setBucket(data.bucket);
      setBackend(data.backend);
      setImages(sortImagesByName(data.images));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="media-gallery">
      <header className="media-gallery__header">
        <div>
          <h1>S3 Media Gallery</h1>
          <p className="media-gallery__meta">
            Bucket <strong>{bucket || "—"}</strong> · Backend{" "}
            <strong>{backend || "—"}</strong> · {images.length} image
            {images.length === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {loading && <p className="media-gallery__status">Loading images…</p>}
      {error && <p className="media-gallery__error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="media-gallery__list-panel">
            <h2>Image inventory</h2>
            <div className="media-gallery__table-wrap">
              <table className="media-gallery__table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>App link</th>
                    <th>S3 link</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Key</th>
                  </tr>
                </thead>
                <tbody>
                  {images.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="media-gallery__empty">
                        No images found in storage.
                      </td>
                    </tr>
                  ) : (
                    images.map((img) => (
                      <tr key={img.key}>
                        <td>{img.name}</td>
                        <td>
                          <a href={img.url} target="_blank" rel="noreferrer">
                            {img.url}
                          </a>
                        </td>
                        <td>
                          <a
                            href={img.s3_url}
                            target="_blank"
                            rel="noreferrer"
                            className="media-gallery__s3-link"
                          >
                            {img.s3_url}
                          </a>
                        </td>
                        <td>{img.content_type}</td>
                        <td>
                          {img.size_human}{" "}
                          <span className="media-gallery__size-bytes">
                            ({img.size.toLocaleString()} B)
                          </span>
                        </td>
                        <td>{formatMediaDate(img.last_modified)}</td>
                        <td className="media-gallery__key">{img.key}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="media-gallery__grid-panel">
            <h2>Preview grid</h2>
            {images.length === 0 ? (
              <p className="media-gallery__empty">Nothing to preview yet.</p>
            ) : (
              <ul className="media-gallery__grid">
                {images.map((img) => (
                  <li key={img.key} className="media-gallery__tile">
                    <a href={img.url} target="_blank" rel="noreferrer">
                      <img src={img.url} alt={img.name} loading="lazy" />
                    </a>
                    <div className="media-gallery__tile-caption">
                      <span className="media-gallery__tile-name">{img.name}</span>
                      <span className="media-gallery__tile-meta">
                        {img.size_human} · {formatMediaDate(img.last_modified)}
                      </span>
                      <a
                        className="media-gallery__tile-s3"
                        href={img.s3_url}
                        target="_blank"
                        rel="noreferrer"
                        title={img.s3_url}
                      >
                        {img.s3_url}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default MediaGallery;
