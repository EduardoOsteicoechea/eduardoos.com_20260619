import HomescoolArticles from "./HomescoolArticles";
import HomescoolInterestForm from "./HomescoolInterestForm";
import HomescoolResources from "./HomescoolResources";
import "./HomescoolPage.css";

/** Public Homescool landing: articles from pamphlets, resource cards, interest form. */
export default function HomescoolPage() {
  return (
    <div className="homescool-page">
      <header className="homescool-page__intro">
        <p className="homescool-page__brand">Homescool</p>
        <h1 className="homescool-page__title">Material, recursos e información</h1>
        <p className="homescool-page__lead">
          Artículos que nacen de panfletos, tarjetas de recursos para empezar, y un formulario si
          estás interesado y requieres más información.
        </p>
      </header>

      <div className="homescool-page__section">
        <HomescoolArticles />
      </div>

      <div className="homescool-page__section">
        <HomescoolResources />
      </div>

      <div className="homescool-page__section" id="interes">
        <HomescoolInterestForm />
      </div>
    </div>
  );
}
