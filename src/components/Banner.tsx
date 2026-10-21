export type BannerType = "error" | "warning" | "info" | "success";

interface BannerProps {
  /** Kind of message; controls the colour and how assistive tech announces it. */
  type: BannerType;
  /** Text to show. Nothing is rendered when this is empty or null. */
  message: string | null | undefined;
  /** When given, a dismiss button is shown that calls it. */
  onDismiss?: () => void;
}

// Errors and warnings interrupt screen readers (alert); info and success wait their
// turn (status).
const ROLE: Record<BannerType, "alert" | "status"> = {
  error: "alert",
  warning: "alert",
  info: "status",
  success: "status",
};

const Banner = ({ type, message, onDismiss }: BannerProps) => {
  if (!message) return null;

  return (
    <div role={ROLE[type]} className={`banner banner-${type}`}>
      <span className="banner-message">{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="banner-dismiss"
          aria-label={`Dismiss ${type}`}
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Banner;
