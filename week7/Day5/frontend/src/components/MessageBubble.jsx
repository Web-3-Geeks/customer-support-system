import { useEffect, useRef, useState } from "react";
import { formatDateTime, formatMessageTime } from "../utils/tickets";
import { MESSAGE_MAX_LENGTH } from "../utils/messages";
import Alert from "./Alert";
import Button from "./Button";
import RoleBadge from "./RoleBadge";

// One message in the conversation. System lines (status changes, assignments) are shown as a quiet centred note.
function MessageBubble({ message, mine, canEdit, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const editFieldRef = useRef(null);
  const editTriggerRef = useRef(null);
  const wasEditing = useRef(false);

  // Keyboard focus goes into the edit field, and back to the Edit button when editing ends.
  useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      editFieldRef.current?.focus();
    } else if (wasEditing.current) {
      wasEditing.current = false;
      editTriggerRef.current?.focus();
    }
  }, [editing]);

  if (message.messageType === "SYSTEM") {
    return (
      <li className="flex justify-center">
        <p className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-muted">
          {message.message}
          <span aria-hidden="true"> &middot; </span>
          <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
            {formatMessageTime(message.createdAt)}
          </time>
        </p>
      </li>
    );
  }

  const sender = message.senderId;
  const senderName = mine ? "You" : (sender?.name ?? "Unknown user");

  const startEditing = () => {
    setText(message.message);
    setError("");
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("A message cannot be empty.");
      return;
    }
    setSaving(true);
    setError("");
    const result = await onEdit(message._id, trimmed);
    setSaving(false);
    if (result.ok) {
      setEditing(false);
    } else {
      setError(result.error);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };

  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] sm:max-w-[75%] ${mine ? "items-end text-right" : "items-start"} flex flex-col`}>
        <div className={`mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${mine ? "justify-end" : ""}`}>
          <span className="font-semibold text-ink">{senderName}</span>
          {!mine && sender?.role && <RoleBadge role={sender.role} />}
          <time className="text-muted" dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
            {formatMessageTime(message.createdAt)}
          </time>
          {message.editedAt && (
            <span className="text-muted" title={`Edited ${formatDateTime(message.editedAt)}`}>
              (edited)
            </span>
          )}
        </div>

        {editing ? (
          <div className="w-full min-w-[16rem] text-left">
            <label htmlFor={`edit-${message._id}`} className="sr-only">
              Edit your message
            </label>
            <textarea
              id={`edit-${message._id}`}
              ref={editFieldRef}
              rows={3}
              value={text}
              maxLength={MESSAGE_MAX_LENGTH}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-invalid={error ? "true" : "false"}
              className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20"
            />
            {error && (
              <div className="mt-2">
                <Alert type="error">{error}</Alert>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Button variant="dark" className="px-3 py-1.5" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" className="px-3 py-1.5" onClick={cancelEditing} disabled={saving}>
                Cancel
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted">Enter to save, Escape to cancel.</p>
          </div>
        ) : (
          <>
            <p
              className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                mine
                  ? "rounded-br-md bg-navy-800 text-white"
                  : "rounded-bl-md bg-white text-ink ring-1 ring-line"
              }`}
            >
              {message.message}
            </p>
            {canEdit && (
              <button
                ref={editTriggerRef}
                type="button"
                onClick={startEditing}
                className="mt-1 text-xs font-semibold text-coral-600 underline-offset-2 hover:underline"
              >
                Edit
                <span className="sr-only"> your message</span>
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export default MessageBubble;
