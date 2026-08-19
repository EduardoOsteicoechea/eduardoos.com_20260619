/**
 * Register an existing platform user as the signed-in teacher's student.
 */

import { useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { registerHomescoolStudent, studentWorkspaceHref } from "../../lib/homescool";
import { validateEmail } from "../../lib/validation";
import ServiceGate from "../ServiceGate/ServiceGate";
import "./Homescool.css";

export default function RegisterStudentPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    const emailError = validateEmail(trimmed);
    if (emailError) {
      setStatus(emailError);
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await registerHomescoolStudent(trimmed);
      setStatus(`Registered ${result.link.studentEmail}. Opening workspace…`);
      window.location.href = studentWorkspaceHref(result.link.studentSlug);
    } catch {
      // ServerErrorModal already opened by client helper.
      setStatus("Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool" requireSubscription>
      <article className="product-page">
        <p className="product-page__brand">Homescool</p>
        <h1 className="product-page__title">Register a student</h1>
        <p className="product-page__lead">
          Link another user who already has an Eduardo OS account. This creates
          their folder space under your teacher prefix.
        </p>
        <form className="homescool-form" onSubmit={(e) => void onSubmit(e)}>
          <label htmlFor="homescool-student-email">Student email</label>
          <input
            id="homescool-student-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            disabled={busy}
          />
          <p className="homescool-form__hint">
            The address must already exist on the platform. Duplicates for the
            same teacher→student pair are rejected.
          </p>
          {status ? <p className="homescool-form__status">{status}</p> : null}
          <div className="product-page__cta-row">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Registering…" : "Register student"}
            </button>
            <a className="btn" href={APP_ROUTES.homescoolStudents}>
              My students
            </a>
            <a className="btn" href={APP_ROUTES.homescool}>
              Back
            </a>
          </div>
        </form>
      </article>
    </ServiceGate>
  );
}
