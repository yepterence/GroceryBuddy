import { PointerEvent, useRef, MouseEvent } from "react";
import type { Suggestion } from "../types";

interface SuggestionBubbleProps {
  suggestion: Suggestion;
  /** Shown as a small chip that expands again when clicked. */
  collapsed: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onExpand: () => void;
  /** Sit inside a parent row instead of being its own list item. */
  inline?: boolean;
}

// Horizontal travel, in px, that counts as a swipe-away.
const SWIPE_DISTANCE = 60;

const SuggestionBubble = ({
  suggestion,
  collapsed,
  onAccept,
  onDismiss,
  onExpand,
  inline = false,
}: SuggestionBubbleProps) => {
  const swipeStartX = useRef<number | null>(null);
  const swiped = useRef(false);
  const name = suggestion.payload.item_name;

  const Slot = inline ? "div" : "li";

  if (collapsed) {
    return (
      <Slot className="suggestion-slot">
        <button
          type="button"
          className="suggestion-chip"
          aria-label={`Show suggestion: ${name}`}
          onClick={onExpand}
        >
          {name}
        </button>
      </Slot>
    );
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swipeStartX.current = e.clientX;
    swiped.current = false;
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartX.current;
    swipeStartX.current = null;
    if (start !== null && Math.abs(e.clientX - start) >= SWIPE_DISTANCE) {
      swiped.current = true;
      onDismiss();
    }
  };

  // A swipe that ends on a button must not also press it.
  const swallowClickAfterSwipe = (e: MouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <Slot className="suggestion-slot">
      <div
        className="suggestion-bubble"
        role="group"
        aria-label="Suggestion"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClickCapture={swallowClickAfterSwipe}
      >
        <button
          type="button"
          className="suggestion-accept"
          aria-label={`Add ${name}`}
          onClick={onAccept}
        >
          <span className="suggestion-name">{name}</span>
          <span className="suggestion-reason">{suggestion.reason}</span>
        </button>
        <button
          type="button"
          className="suggestion-dismiss"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </Slot>
  );
};

export default SuggestionBubble;
