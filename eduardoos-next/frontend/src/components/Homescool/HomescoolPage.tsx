import { APP_ROUTES } from "../../config/routes";
import ServiceGate from "../ServiceGate/ServiceGate";

export default function HomescoolPage() {
  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool">
      <article className="product-page">
        <p className="product-page__brand">Services</p>
        <h1 className="product-page__title">Homescool</h1>
        <p className="product-page__lead">
          A home-education hub for resources, reading lists, and practical tools.
        </p>
        <ul className="product-page__list">
          <li>Cloud pamphlets via EPAM documents</li>
          <li>Articles library for structured reading</li>
          <li>Contact assistant for enrollment questions</li>
        </ul>
        <div className="product-page__cta-row">
          <a className="btn btn--primary" href={APP_ROUTES.pamphlet}>
            Open pamphlets
          </a>
          <a className="btn" href={APP_ROUTES.articles}>
            Browse articles
          </a>
        </div>
      </article>
    </ServiceGate>
  );
}
