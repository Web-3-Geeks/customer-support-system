import { NavLink } from "react-router-dom";
import Logo from "./Logo";
import RoleBadge from "./RoleBadge";
import { CloseIcon, LogoutIcon } from "./icons";
import { NAV_ITEMS } from "../config/navigation";

const itemBase = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition";

function Sidebar({ user, onLogout, onClose }) {
  const items = NAV_ITEMS[user.role] ?? [];

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur">
      <div className="flex items-center justify-between px-2 pt-1 pb-5">
        <Logo to="/" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="rounded-lg p-1.5 text-muted hover:bg-slate-100 lg:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1">
        {items.map(({ label, to, icon: Icon, soon, end }) =>
          to ? (
            <NavLink
              key={label}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `${itemBase} ${
                  isActive
                    ? "bg-linear-to-b from-coral-400 to-coral-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ) : (
            <div
              key={label}
              aria-disabled="true"
              className={`${itemBase} cursor-not-allowed text-slate-400`}
            >
              <Icon />
              <span className="flex-1">{label}</span>
              {soon && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              )}
            </div>
          )
        )}
      </nav>

      <div className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-line">
        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
        <div className="mt-2">
          <RoleBadge role={user.role} />
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-slate-50"
        >
          <LogoutIcon width={18} height={18} />
          Log out
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
