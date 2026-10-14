import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../api/adminApi";
import { ticketApi } from "../api/ticketApi";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../utils/getErrorMessage";
import { ROLES } from "../utils/roles";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  formatDateTime,
  ticketBasePath,
} from "../utils/tickets";
import Alert from "../components/Alert";
import Button from "../components/Button";
import ConversationPanel from "../components/ConversationPanel";
import Input from "../components/Input";
import Select from "../components/Select";
import Textarea from "../components/Textarea";
import StatusBadge from "../components/StatusBadge";
import PriorityBadge from "../components/PriorityBadge";
import FullPageLoader from "../components/FullPageLoader";
import { usePageTitle } from "../hooks/usePageTitle";

function Meta({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function describeTicketEvent(eventName, payload, actor) {
  if (eventName === "ticket_status_changed") {
    return `${actor.name} changed the status to ${STATUS_LABELS[payload.to] ?? payload.to}.`;
  }
  if (eventName === "ticket_assigned") {
    return `${actor.name} assigned this ticket to ${payload.assignedTo.name}.`;
  }
  return `${actor.name} updated this ticket.`;
}

function TicketDetailContent({ id }) {
  const { user } = useAuth();
  const basePath = ticketBasePath(user.role);

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [agents, setAgents] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ subject: "", description: "", category: "GENERAL" });
  const [confirmClose, setConfirmClose] = useState(false);
  const [draft, setDraft] = useState({ status: "", priority: "", category: "", agentId: "" });

  const confirmButtonRef = useRef(null);
  const closeTriggerRef = useRef(null);
  const confirmWasOpen = useRef(false);
  const subjectInputRef = useRef(null);

  usePageTitle(ticket ? ticket.ticketNumber : "Ticket");

  // Move keyboard focus into the confirmation, and back to its trigger when it is dismissed.
  useEffect(() => {
    if (confirmClose) {
      confirmWasOpen.current = true;
      confirmButtonRef.current?.focus();
    } else if (confirmWasOpen.current) {
      confirmWasOpen.current = false;
      closeTriggerRef.current?.focus();
    }
  }, [confirmClose]);

  useEffect(() => {
    if (editing) subjectInputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    let ignore = false;

    ticketApi
      .get(id)
      .then(({ data }) => {
        if (!ignore) setTicket(data.data.ticket);
      })
      .catch((error) => {
        if (!ignore) {
          setLoadError({ message: getErrorMessage(error), notFound: error.response?.status === 404 });
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  useEffect(() => {
    if (user.role !== ROLES.ADMIN) return;
    let ignore = false;

    adminApi
      .getUsers({ role: "AGENT" })
      .then(({ data }) => {
        if (!ignore) setAgents(data.data.users);
      })
      .catch(() => {
        // assigning stays unavailable if the agent list cannot be loaded
      });

    return () => {
      ignore = true;
    };
  }, [user.role]);

  if (loading) return <FullPageLoader />;

  if (loadError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold text-ink">
          {loadError.notFound ? "Ticket not found" : "Could not load the ticket"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {loadError.notFound
            ? "It may not exist, or you may not have access to it."
            : loadError.message}
        </p>
        <Button to={basePath} className="mt-6">
          Back to tickets
        </Button>
      </div>
    );
  }

  const isCustomer = user.role === ROLES.CUSTOMER;
  const isAgent = user.role === ROLES.AGENT;
  const isAdmin = user.role === ROLES.ADMIN;
  const isClosed = ticket.status === "CLOSED";
  const nextStatuses = ticket.allowedNextStatuses ?? [];
  const canEditText = isCustomer && ticket.status === "OPEN";
  const canClose = isCustomer && nextStatuses.includes("CLOSED");

  const run = async (action, successMessage) => {
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await action();
      setTicket(data.data.ticket);
      setNotice({ type: "success", message: successMessage });
      return true;
    } catch (error) {
      setNotice({ type: "error", message: getErrorMessage(error) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Someone else changed this ticket while it is open: show the new state and say what happened.
  // Events caused by this user's own actions are skipped, because the page already shows their result.
  const handleTicketEvent = (eventName, payload) => {
    const actor = payload.changedBy ?? payload.updatedBy ?? payload.assignedBy;
    if (!actor || actor.id === user._id) return;

    ticketApi
      .get(id)
      .then(({ data }) => {
        setTicket(data.data.ticket);
        setNotice({ type: "success", message: describeTicketEvent(eventName, payload, actor) });
      })
      .catch((error) => {
        // Losing access (for example after a reassignment) shows the same page as any other missing ticket.
        if (error.response?.status === 404) {
          setLoadError({ message: getErrorMessage(error), notFound: true });
        }
      });
  };

  const startEditing = () => {
    setEditForm({
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
    });
    setNotice(null);
    setEditing(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const ok = await run(
      () =>
        ticketApi.update(ticket._id, {
          subject: editForm.subject.trim(),
          description: editForm.description.trim(),
          category: editForm.category,
        }),
      "Ticket updated."
    );
    if (ok) setEditing(false);
  };

  const closeTicket = async () => {
    setConfirmClose(false);
    await run(
      () => ticketApi.changeStatus(ticket._id, "CLOSED"),
      ticket.status === "OPEN" ? "Ticket cancelled." : "Ticket closed."
    );
  };

  const updateStatus = async () => {
    const ok = await run(
      () => ticketApi.changeStatus(ticket._id, draft.status),
      `Status changed to ${STATUS_LABELS[draft.status]}.`
    );
    if (ok) setDraft((prev) => ({ ...prev, status: "" }));
  };

  const priorityValue = draft.priority || ticket.priority;
  const categoryValue = draft.category || ticket.category;
  const agentValue = draft.agentId || ticket.assignedTo?._id || "";
  const agentOptions =
    ticket.assignedTo && !agents.some((agent) => agent._id === ticket.assignedTo._id)
      ? [ticket.assignedTo, ...agents]
      : agents;

  const savePriorityAndCategory = async () => {
    const changes = {};
    if (priorityValue !== ticket.priority) changes.priority = priorityValue;
    if (isAdmin && categoryValue !== ticket.category) changes.category = categoryValue;

    const ok = await run(() => ticketApi.update(ticket._id, changes), "Ticket updated.");
    if (ok) setDraft((prev) => ({ ...prev, priority: "", category: "" }));
  };

  const assign = async () => {
    const ok = await run(() => adminApi.assignTicket(ticket._id, agentValue), "Ticket assigned.");
    if (ok) setDraft((prev) => ({ ...prev, agentId: "" }));
  };

  const priorityChanged = priorityValue !== ticket.priority;
  const categoryChanged = isAdmin && categoryValue !== ticket.category;
  const assigneeChanged = agentValue !== "" && agentValue !== (ticket.assignedTo?._id ?? "");

  return (
    <>
      <Link to={basePath} className="mb-4 inline-block text-sm font-semibold text-coral-600 hover:underline">
        &larr; Back to tickets
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{ticket.ticketNumber}</p>
          <h1 className="mt-1 break-words text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {ticket.subject}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>

      {notice && (
        <div className="mb-4">
          <Alert type={notice.type}>{notice.message}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2" aria-label="Ticket details">
          <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
            {editing ? (
              <form onSubmit={saveEdit} noValidate className="space-y-5">
                <Input
                  ref={subjectInputRef}
                  label="Subject"
                  value={editForm.subject}
                  maxLength={150}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, subject: e.target.value }))}
                />
                <Select
                  label="Category"
                  value={editForm.category}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  {TICKET_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </Select>
                <Textarea
                  label="Description"
                  value={editForm.description}
                  maxLength={5000}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <div className="flex gap-3">
                  <Button type="submit" variant="dark" disabled={busy}>
                    {busy ? "Saving..." : "Save changes"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Description</h2>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                  {ticket.description}
                </p>
              </>
            )}
          </div>

          <dl className="grid gap-4 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:grid-cols-2">
            <Meta label="Customer">
              {ticket.createdBy?.name}
              <span className="block text-xs text-muted">{ticket.createdBy?.email}</span>
            </Meta>
            <Meta label="Assigned agent">
              {ticket.assignedTo ? (
                <>
                  {ticket.assignedTo.name}
                  <span className="block text-xs text-muted">{ticket.assignedTo.email}</span>
                </>
              ) : (
                <span className="text-muted">Not assigned yet</span>
              )}
            </Meta>
            <Meta label="Category">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</Meta>
            <Meta label="Priority">{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Meta>
            <Meta label="Created">{formatDateTime(ticket.createdAt)}</Meta>
            <Meta label="Last updated">{formatDateTime(ticket.updatedAt)}</Meta>
            {ticket.resolvedAt && <Meta label="Resolved">{formatDateTime(ticket.resolvedAt)}</Meta>}
          </dl>

          <ConversationPanel ticket={ticket} onTicketEvent={handleTicketEvent} />
        </section>

        <aside className="space-y-4" aria-label="Manage ticket">
          <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Manage</h2>

            {isClosed && (
              <p className="text-sm text-muted">This ticket is closed. No further changes can be made.</p>
            )}

            {isCustomer && !isClosed && (
              <div className="space-y-3">
                {canEditText && !editing && (
                  <Button variant="ghost" className="w-full" onClick={startEditing}>
                    Edit ticket
                  </Button>
                )}
                {!canEditText && (
                  <p className="text-xs text-muted">
                    Tickets can only be edited while they are open.
                  </p>
                )}
                {canClose &&
                  (confirmClose ? (
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                      <p className="text-sm text-ink">
                        {ticket.status === "OPEN"
                          ? "Cancel this ticket? This cannot be undone."
                          : "Close this ticket? This cannot be undone."}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          ref={confirmButtonRef}
                          variant="dark"
                          className="px-3 py-1.5"
                          onClick={closeTicket}
                          disabled={busy}
                        >
                          Yes, continue
                        </Button>
                        <Button variant="ghost" className="px-3 py-1.5" onClick={() => setConfirmClose(false)}>
                          Keep open
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      ref={closeTriggerRef}
                      variant="primary"
                      className="w-full"
                      onClick={() => setConfirmClose(true)}
                    >
                      {ticket.status === "OPEN" ? "Cancel ticket" : "Confirm and close"}
                    </Button>
                  ))}
              </div>
            )}

            {(isAgent || isAdmin) && !isClosed && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Select
                    label="Change status"
                    value={draft.status}
                    disabled={nextStatuses.length === 0 || busy}
                    onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="">{nextStatuses.length === 0 ? "No changes available" : "Select new status"}</option>
                    {nextStatuses.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                  <Button className="w-full" variant="dark" disabled={!draft.status || busy} onClick={updateStatus}>
                    Update status
                  </Button>
                </div>

                <div className="space-y-3">
                  <Select
                    label="Priority"
                    value={priorityValue}
                    disabled={busy}
                    onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value }))}
                  >
                    {TICKET_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                  {isAdmin && (
                    <Select
                      label="Category"
                      value={categoryValue}
                      disabled={busy}
                      onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                    >
                      {TICKET_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                          {CATEGORY_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button
                    className="w-full"
                    variant="ghost"
                    disabled={(!priorityChanged && !categoryChanged) || busy}
                    onClick={savePriorityAndCategory}
                  >
                    {isAdmin ? "Save priority and category" : "Save priority"}
                  </Button>
                </div>

                {isAdmin && (
                  <div className="space-y-3">
                    <Select
                      label="Assign to agent"
                      value={agentValue}
                      disabled={agents.length === 0 || busy}
                      onChange={(e) => setDraft((prev) => ({ ...prev, agentId: e.target.value }))}
                    >
                      <option value="" disabled>
                        {agents.length === 0 ? "No agents available" : "Select an agent"}
                      </option>
                      {agentOptions.map((agent) => (
                        <option key={agent._id} value={agent._id}>
                          {agent.name}
                        </option>
                      ))}
                    </Select>
                    <Button className="w-full" variant="ghost" disabled={!assigneeChanged || busy} onClick={assign}>
                      {ticket.assignedTo ? "Reassign ticket" : "Assign ticket"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

// Keyed by id so moving from one ticket to another starts with a clean state.
function TicketDetail() {
  const { id } = useParams();
  return <TicketDetailContent key={id} id={id} />;
}

export default TicketDetail;
