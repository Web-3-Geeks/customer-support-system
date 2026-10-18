import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_STYLE, SERIES_COLORS } from "../../utils/chartColors";

const GRID = <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ee" vertical={false} />;

export function TicketsOverTimeChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS_STYLE} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS_STYLE} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Tickets created" fill={SERIES_COLORS.primary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Horizontal bars, one per category, each in its own colour (status, priority).
export function BreakdownChart({ data, colors }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ee" horizontal={false} />
        <XAxis type="number" tick={AXIS_STYLE} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={AXIS_STYLE} width={140} />
        <Tooltip />
        <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
          {data.map((row) => (
            <Cell key={row.key} fill={colors[row.key]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AgentWorkloadChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 56)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ee" horizontal={false} />
        <XAxis type="number" tick={AXIS_STYLE} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS_STYLE} width={120} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="openNow" name="Open now" fill={SERIES_COLORS.secondary} radius={[0, 4, 4, 0]} />
        <Bar dataKey="resolved" name="Resolved in range" fill={SERIES_COLORS.positive} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SlaComplianceChart({ data }) {
  const percent = (value) => (value === null || value === undefined ? "No data" : `${value}%`);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
        <Tooltip formatter={percent} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="firstResponse" name="First response" fill={SERIES_COLORS.primary} radius={[4, 4, 0, 0]} />
        <Bar dataKey="resolution" name="Resolution" fill={SERIES_COLORS.secondary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
