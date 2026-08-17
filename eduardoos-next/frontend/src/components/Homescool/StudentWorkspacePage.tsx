/**
 * Teacher view of one registered student's folder space.
 * Slug from pretty path /homescool/students/{slug} or ?student=.
 */

import { useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  getHomescoolStudent,
  listTeacherStudentFolder,
  resolveStudentSlugFromLocation,
  type HomescoolLink,
} from "../../lib/homescool";
import ServiceGate from "../ServiceGate/ServiceGate";
import StudentSpaceLayout from "./StudentSpaceLayout";
import "./Homescool.css";

export default function StudentWorkspacePage() {
  const [slug, setSlug] = useState("");
  const [link, setLink] = useState<HomescoolLink | null>(null);
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    const resolved = resolveStudentSlugFromLocation();
    setSlug(resolved);
    if (!resolved) {
      setBootError("Missing student in the URL.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await getHomescoolStudent(resolved);
        if (!cancelled) setLink(data.link);
      } catch {
        if (!cancelled) setBootError("Could not load this student workspace.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFolder = useCallback(
    async (folder: string) => {
      if (!slug) return { objects: [], prefix: "" };
      const data = await listTeacherStudentFolder(slug, folder);
      return { objects: data.objects, prefix: data.prefix };
    },
    [slug],
  );

  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool">
      <div className="page-shell page-shell--homescool-flush">
        <div className="product-page__cta-row homescool-workspace__nav">
          <a className="btn" href={APP_ROUTES.homescoolStudents}>
            All students
          </a>
          <a className="btn" href={APP_ROUTES.homescool}>
            Hub
          </a>
        </div>
        {bootError ? <p className="homescool-empty">{bootError}</p> : null}
        {!bootError && slug ? (
          <StudentSpaceLayout
            brand="Teacher workspace"
            title={link?.studentEmail ?? slug}
            lead="Choose a folder card. Tasks opens four boards; create templates in the sidebar and assign from the dashboard."
            link={link}
            loadFolder={loadFolder}
            mode="teacher"
            studentSlug={slug}
          />
        ) : null}
      </div>
    </ServiceGate>
  );
}
