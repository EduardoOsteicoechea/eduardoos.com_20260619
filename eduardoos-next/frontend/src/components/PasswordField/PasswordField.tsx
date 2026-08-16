/**
 * Password input with Show / Hide toggle for auth forms.
 */

import { useId, useState, type ChangeEventHandler } from "react";
import "./PasswordField.css";

export interface PasswordFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  autoComplete?: string;
  error?: string;
  autoFocus?: boolean;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  error,
  autoFocus,
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={`form-field password-field ${error ? "form-field--error" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="password-field__control">
        <input
          id={inputId}
          className="password-field__input"
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
        />
        <button
          type="button"
          className="password-field__toggle"
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
