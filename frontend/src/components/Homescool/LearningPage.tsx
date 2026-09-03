/**
 * Student learning view â€” same folder cards; Folders sidebar toggles from
 * Header Dynamic Menu (persisted in localStorage).
 * Content is scoped to relationships where the JWT user is the student.
 */

import { useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { ViewLoading } from "../ViewLoading/ViewLoading";
import {
  listHomescoolLearning,
  listLearningFolder,
  safeEmailKey,
  type HomescoolLink,
} from "../../lib/homescool";
import ServiceGate from "../ServiceGate/ServiceGate";
import StudentSpaceLayout from "./StudentSpaceLayout";
import "./Homescool.css";

export default function LearningPage() {
  const [links, setLinks] = useState<HomescoolLink[]>([]);
  const [active, setActive] = useState<HomescoolLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listHomescoolLearning();
        if (cancelled) return;
        const items = data.links ?? [];
        setLinks(items);
        setActive(items[0] ?? null);
        if (items.length === 0) {
          setError("You are not registered as a student under any teacher yet.");
        }
      } catch {
        if (!cancelled) setError("Could not load your learning space.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const teacherSlug = active ? safeEmailKey(active.teacherEmail) : "";

  const loadFolder = useCallback(
    async (folder: string) => {
      if (!teacherSlug) return { objects: [], prefix: "" };
      const data = await listLearningFolder(teacherSlug, folder);
      return { objects: data.objects, prefix: data.prefix };
    },
    [teacherSlug],
  );

  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool">
      <div className="page-shell page-shell--homescool-flush">
        <div className="product-page__cta-row homescool-workspace__nav">
          <a className="btn" href={APP_ROUTES.homescool}>
            Hub
          </a>
        </div>
        {loading ? <ViewLoading label="Loading learning space" /> : null}
        {!loading && error && links.length === 0 ? (
          <article className="product-page">
            <p className="product-page__brand">Homescool</p>
            <h1 className="product-page__title">My learning space</h1>
            <p className="product-page__lead">{error}</p>
          </article>
        ) : null}
        {!loading && links.length > 1 ? (
          <div className="homescool-teacher-select" role="group" aria-label="Teachers">
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                className={`btn${active?.id === link.id ? " btn--primary" : ""}`}
                onClick={() => setActive(link)}
              >
                {link.teacherEmail}
              </button>
            ))}
          </div>
        ) : null}
        {!loading && active ? (
          <StudentSpaceLayout
            brand="Learning space"
            title={`Under ${active.teacherEmail}`}
            lead="Calendar on top, pending tasks below. Same assignment data as Tasks and Calendar folders."
            link={active}
            loadFolder={loadFolder}
            mode="student"
            teacherSlug={teacherSlug}
          />
        ) : null}
      </div>
    </ServiceGate>
  );
}
