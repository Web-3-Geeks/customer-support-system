import { useState } from "react";
import { adminApi } from "../api/adminApi";
import { getErrorMessage } from "../utils/getErrorMessage";

function AssigneeSelect({ ticket, agents, onAssigned }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isClosed = ticket.status === "CLOSED";

  const handleChange = async (e) => {
    setSaving(true);
    setError("");
    try {
      await adminApi.assignTicket(ticket._id, e.target.value);
      onAssigned();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <select
        aria-label={`Assign ${ticket.ticketNumber}`}
        value={ticket.assignedTo?._id ?? ""}
        onChange={handleChange}
        disabled={saving || isClosed || agents.length === 0}
        title={isClosed ? "Closed tickets cannot be reassigned" : undefined}
        className="w-full max-w-[12rem] rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="" disabled>
          Unassigned
        </option>
        {agents.map((agent) => (
          <option key={agent._id} value={agent._id}>
            {agent.name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default AssigneeSelect;
