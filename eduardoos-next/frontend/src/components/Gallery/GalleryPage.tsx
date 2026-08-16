import { APP_ROUTES } from "../../config/routes";
import ServiceGate from "../ServiceGate/ServiceGate";

export default function GalleryPage() {
  return (
    <ServiceGate serviceId="videos" serviceLabel="Videos">
      <article className="product-page">
        <p className="product-page__brand">Media</p>
        <h1 className="product-page__title">Gallery</h1>
        <p className="product-page__lead">
          Images and short videos from the media library. Cloud objects will list
          from <code>/api/media</code>.
        </p>
        <div className="product-page__cta-row">
          <a className="btn" href={APP_ROUTES.mediaPlaylist}>
            Music playlists
          </a>
        </div>
      </article>
    </ServiceGate>
  );
}
