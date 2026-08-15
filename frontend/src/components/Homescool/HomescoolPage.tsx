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
        <h1 className="homescool-page__title">Material, resources, and information</h1>
        <p className="homescool-page__lead">
          Articles that begin as pamphlets, resource cards to get started, and a form if you
          are interested and need more information.
        </p>
      </header>

      <div className="homescool-page__section">
        <HomescoolArticles />
      </div>

      <div className="homescool-page__section">
        <HomescoolResources />
      </div>

      <div className="homescool-page__section" id="interest">
        <HomescoolInterestForm />
      </div>
    </div>
  );
}
