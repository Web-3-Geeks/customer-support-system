import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";
import { CATEGORY_LABELS, formatDate } from "../utils/tickets";

function TicketTable({ tickets, basePath, showCustomer = false, renderAssignee, showAssignee = false }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">Tickets</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-5 py-3 font-semibold">Ticket</th>
            {showCustomer && <th scope="col" className="px-5 py-3 font-semibold">Customer</th>}
            <th scope="col" className="px-5 py-3 font-semibold">Status</th>
            <th scope="col" className="px-5 py-3 font-semibold">Priority</th>
            {(showAssignee || renderAssignee) && (
              <th scope="col" className="px-5 py-3 font-semibold">Assigned to</th>
            )}
            <th scope="col" className="px-5 py-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket._id} className="border-b border-line align-top last:border-0">
              <td className="px-5 py-3">
                <Link
                  to={`${basePath}/${ticket._id}`}
                  className="block max-w-xs truncate font-semibold text-ink hover:text-coral-600 hover:underline"
                >
                  {ticket.subject}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {ticket.ticketNumber} · {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                </p>
              </td>
              {showCustomer && (
                <td className="px-5 py-3">
                  <p className="max-w-[12rem] truncate text-ink">{ticket.createdBy?.name}</p>
                  <p className="max-w-[12rem] truncate text-xs text-muted">{ticket.createdBy?.email}</p>
                </td>
              )}
              <td className="px-5 py-3">
                <StatusBadge status={ticket.status} />
              </td>
              <td className="px-5 py-3">
                <PriorityBadge priority={ticket.priority} />
              </td>
              {renderAssignee ? (
                <td className="px-5 py-3">{renderAssignee(ticket)}</td>
              ) : (
                showAssignee && (
                  <td className="px-5 py-3 text-muted">{ticket.assignedTo?.name ?? "Unassigned"}</td>
                )
              )}
              <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDate(ticket.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TicketTable;
