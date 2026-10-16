import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { useSocket } from "../context/useSocket";
import { useNow } from "../hooks/useNow";
import { useTicketConversation } from "../hooks/useTicketConversation";
import { ROLE_LABELS } from "../utils/roles";
import Button from "./Button";
import ConnectionStatus from "./ConnectionStatus";
import EmptyState from "./EmptyState";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";

const NEAR_BOTTOM_PX = 80;

function ListSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 p-4">
      <span className="sr-only">Loading the conversation</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className={`flex ${row === 1 ? "justify-end" : ""}`}>
          <div className="h-12 w-3/5 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

// The conversation for one ticket: history, live incoming messages, and the composer.
function ConversationPanel({ ticket, onTicketEvent }) {
  const { user } = useAuth();
  const { status, reconnect } = useSocket();
  const conversation = useTicketConversation(ticket._id, onTicketEvent);
  const now = useNow();

  const { messages, loading, error, hasMore, loadingOlder, olderError, participants, roomError } = conversation;
  const isClosed = ticket.status === "CLOSED";
  const others = participants.filter((person) => person.id !== user._id);

  const listRef = useRef(null);
  const followNewest = useRef(true);
  const heightBeforeOlder = useRef(null);
  const [atBottom, setAtBottom] = useState(true);

  const handleScroll = () => {
    const list = listRef.current;
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
    followNewest.current = near;
    setAtBottom(near);
  };

  // Stay at the newest message while the reader is there; keep their place when older messages are added above.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (heightBeforeOlder.current !== null) {
      list.scrollTop += list.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (followNewest.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, loading]);

  const loadOlder = async () => {
    heightBeforeOlder.current = listRef.current?.scrollHeight ?? null;
    await conversation.loadOlder();
  };

  const jumpToNewest = () => {
    const list = listRef.current;
    list.scrollTop = list.scrollHeight;
    followNewest.current = true;
    setAtBottom(true);
  };

  const canEdit = (message) =>
    !isClosed &&
    message.messageType === "TEXT" &&
    message.senderId?._id === user._id &&
    Boolean(message.editableUntil) &&
    new Date(message.editableUntil).getTime() > now;

  return (
    <section
      aria-labelledby="conversation-heading"
      className="overflow-hidden rounded-3xl bg-white/80 shadow-sm ring-1 ring-black/5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div>
          <h2 id="conversation-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Conversation
          </h2>
          {others.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Here now: {others.map((person) => `${person.name} (${ROLE_LABELS[person.role] ?? person.role})`).join(", ")}
            </p>
          )}
        </div>
        <ConnectionStatus status={status} onReconnect={reconnect} />
      </div>

      {roomError && (
        <p role="status" className="border-b border-line bg-amber-50 px-5 py-2 text-xs text-amber-800">
          Live updates are unavailable for this ticket: {roomError}
        </p>
      )}

      <div className="relative">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <div className="space-y-3 p-5">
            <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
            <Button variant="ghost" onClick={conversation.retry}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              onScroll={handleScroll}
              role="log"
              aria-label="Conversation messages"
              aria-live="polite"
              aria-relevant="additions"
              tabIndex={0}
              className="max-h-[28rem] min-h-48 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {hasMore && (
                <div className="mb-4 text-center">
                  <Button variant="ghost" className="px-3 py-1.5" onClick={loadOlder} disabled={loadingOlder}>
                    {loadingOlder ? "Loading..." : "Load earlier messages"}
                  </Button>
                  {olderError && (
                    <p role="alert" className="mt-2 text-xs text-red-700">
                      {olderError}
                    </p>
                  )}
                </div>
              )}

              {messages.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  text={
                    isClosed
                      ? "This ticket was closed before anyone wrote a message."
                      : "Start the conversation by writing the first message below."
                  }
                />
              ) : (
                <ul className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message._id}
                      message={message}
                      mine={message.senderId?._id === user._id}
                      canEdit={canEdit(message)}
                      onEdit={conversation.edit}
                    />
                  ))}
                </ul>
              )}
            </div>

            {!atBottom && messages.length > 0 && (
              <button
                type="button"
                onClick={jumpToNewest}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-navy-800 px-4 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-navy-700"
              >
                Jump to latest message
              </button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-line px-4 py-4 sm:px-5">
        {isClosed ? (
          <p className="text-sm text-muted">This ticket is closed, so the conversation is read only.</p>
        ) : (
          <MessageComposer onSend={conversation.send} sending={conversation.sending} />
        )}
      </div>
    </section>
  );
}

export default ConversationPanel;
