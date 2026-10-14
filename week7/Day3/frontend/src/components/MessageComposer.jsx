import { useRef, useState } from "react";
import { MESSAGE_MAX_LENGTH } from "../utils/messages";
import Alert from "./Alert";
import Button from "./Button";
import Textarea from "./Textarea";

// Enter sends, Shift+Enter adds a new line. The text is only cleared once the server accepted the message.
function MessageComposer({ onSend, sending }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const fieldRef = useRef(null);

  const trimmed = text.trim();

  const submit = async () => {
    if (!trimmed || sending) return;
    setError("");
    const result = await onSend(trimmed);
    if (result.ok) {
      setText("");
      fieldRef.current?.focus();
    } else {
      setError(result.error);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <Textarea
        ref={fieldRef}
        label="Write a message"
        rows={3}
        value={text}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder="Type your message. Press Enter to send, Shift+Enter for a new line."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <Alert type="error">{error}</Alert>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted" aria-hidden="true">
          {text.length}/{MESSAGE_MAX_LENGTH}
        </span>
        <Button type="submit" variant="dark" disabled={!trimmed || sending}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  );
}

export default MessageComposer;
