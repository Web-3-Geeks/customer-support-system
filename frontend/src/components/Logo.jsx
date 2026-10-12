import { Link } from "react-router-dom";

function Logo({ to = "/" }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="SupportDesk home">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="11" stroke="#0f1526" strokeWidth="5" />
        <path
          d="M16 5a11 11 0 0 1 11 11"
          stroke="#ef6b57"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-lg tracking-tight text-ink">
        <span className="font-bold">Support</span>
        <span className="font-light">Desk</span>
      </span>
    </Link>
  );
}

export default Logo;
