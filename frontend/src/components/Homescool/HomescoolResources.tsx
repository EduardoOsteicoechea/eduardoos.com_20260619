import { HOMESCOOL_RESOURCES } from "./resources";
import "./HomescoolResources.css";

/** Grid of Homescool resource links (articles, pamphlet, WhatsApp, email, etc.). */
export default function HomescoolResources() {
  return (
    <section className="homescool-resources" aria-labelledby="homescool-resources-title">
      <h2 id="homescool-resources-title" className="homescool-resources__title">
        Recursos
      </h2>
      <p className="homescool-resources__lead">
        Accesos directos a material, herramientas y canales para empezar o pedir más información.
      </p>
      <ul className="homescool-resources__grid">
        {HOMESCOOL_RESOURCES.map((item) => (
          <li key={item.id}>
            <a
              className="homescool-resources__card"
              href={item.href}
              {...(item.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : item.id === "pamphlet"
                  ? { "data-astro-reload": true }
                  : {})}
            >
              <span className="homescool-resources__card-title">{item.title}</span>
              <p className="homescool-resources__card-blurb">{item.blurb}</p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
