/**
 * Homescool hub — entry CTAs for teacher register / roster and student learning.
 */

import { APP_ROUTES } from "../../config/routes";
import ServiceGate from "../ServiceGate/ServiceGate";
import "./Homescool.css";

export default function HomescoolPage() {
  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool">
      <article className="product-page">
        <p className="product-page__brand">Services</p>
        <h1 className="product-page__title">Homescool</h1>
        <p className="product-page__lead">
          Register platform users as your students, open their learning spaces,
          or enter your own space when another teacher has enrolled you.
        </p>
        <div className="homescool-hub__actions product-page__cta-row">
          <a className="btn btn--primary" href={APP_ROUTES.homescoolRegisterStudent}>
            Register a student
          </a>
          <a className="btn" href={APP_ROUTES.homescoolStudents}>
            My students
          </a>
          <a className="btn" href={APP_ROUTES.homescoolLearning}>
            My learning space
          </a>
        </div>
        <ul className="product-page__list">
          <li>Student folders: portfolio, period, skills, study section, tasks</li>
          <li>Cloud objects live under S3 <code>homeschool/…</code> per teacher→student</li>
          <li>Only existing platform accounts can be registered as students</li>
        </ul>
      </article>
    </ServiceGate>
  );
}
