/**
 * ProfileImageForm.tsx — Upload and preview the signed-in user's profile avatar.
 */
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import { fetchUserProfile, profileImageUrlWithCacheBust, uploadProfileImage } from "../../lib/profile";
import "./ProfileImageForm.css";

export default function ProfileImageForm() {
  const [imageUrl, setImageUrl] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace(`${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.profile)}`);
      return;
    }
    void (async () => {
      setLoading(true);
      const profile = await fetchUserProfile();
      if (profile) {
        setEmail(profile.email);
        setImageUrl(profile.profileImageUrl ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = (event.currentTarget.elements.namedItem("profile-file") as HTMLInputElement | null);
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose an image file first");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const profile = await uploadProfileImage(file);
      if (profile?.profileImageUrl) {
        setImageUrl(profileImageUrlWithCacheBust(profile.profileImageUrl));
      }
      setMessage("Profile image updated");
      if (input) {
        input.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handlePreviewChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setImageUrl(objectUrl);
  }

  if (loading) {
    return <p className="profile-image-form__status">Loading profile…</p>;
  }

  return (
    <form className="profile-image-form panel" onSubmit={(event) => void handleSubmit(event)}>
      <h1 className="panel__title">Profile image</h1>
      <p className="profile-image-form__lead">
        Upload an avatar for {email || "your account"}. It appears in the header session menu.
      </p>

      <div className="profile-image-form__preview-wrap">
        {imageUrl ? (
          <img className="profile-image-form__preview" src={imageUrl} alt="Profile preview" />
        ) : (
          <div className="profile-image-form__preview profile-image-form__preview--empty" aria-hidden="true">
            ?
          </div>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="profile-file">Image file</label>
        <input
          id="profile-file"
          name="profile-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handlePreviewChange}
        />
      </div>

      {error ? <p className="status-message status-message--error">{error}</p> : null}
      {message ? <p className="status-message status-message--success">{message}</p> : null}

      <div className="panel__actions">
        <button className="btn btn--primary" type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Save profile image"}
        </button>
      </div>
    </form>
  );
}
