/**
 * Teacher roster — lists students registered by the signed-in user.
 */

import { useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  listHomescoolStudents,
  studentWorkspaceHref,
  type HomescoolLink,
} from "../../lib/homescool";
import ServiceGate from "../ServiceGate/ServiceGate";
import "./Homescool.css";

export default function StudentsListPage() {
  const [students, setStudents] = useState<HomescoolLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listHomescoolStudents();
        if (!cancelled) setStudents(data.students ?? []);
      } catch {
        if (!cancelled) setError("Could not load students.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool">
      <article className="product-page">
        <p className="product-page__brand">Homescool</p>
        <h1 className="product-page__title">My students</h1>
        <p className="product-page__lead">
          Open a student workspace to browse portfolio, period, skills, study
          section, and tasks.
        </p>
        <div className="product-page__cta-row">
          <a className="btn btn--primary" href={APP_ROUTES.homescoolRegisterStudent}>
            Register a student
          </a>
          <a className="btn" href={APP_ROUTES.homescool}>
            Hub
          </a>
        </div>
        {loading ? <p className="homescool-empty">Loading students…</p> : null}
        {error ? <p className="homescool-empty">{error}</p> : null}
        {!loading && !error && students.length === 0 ? (
          <p className="homescool-empty">No students registered yet.</p>
        ) : null}
        <ul className="homescool-student-list">
          {students.map((s) => (
            <li key={s.id} className="homescool-student-list__item">
              <div>
                <div className="homescool-student-list__email">{s.studentEmail}</div>
                <div className="homescool-student-list__meta">
                  {s.s3Prefix} · since {s.createdAt.slice(0, 10)}
                </div>
              </div>
              <a className="btn btn--primary" href={studentWorkspaceHref(s.studentSlug)}>
                Open space
              </a>
            </li>
          ))}
        </ul>
      </article>
    </ServiceGate>
  );
}
