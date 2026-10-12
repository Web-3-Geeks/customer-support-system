import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Sidebar from "./Sidebar";
import Logo from "./Logo";
import { MenuIcon } from "./icons";

function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen p-3 lg:p-4">
      <aside className="fixed inset-y-4 left-4 hidden w-64 lg:block">
        <Sidebar user={user} onLogout={handleLogout} onClose={() => {}} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-900/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-3 left-3 w-72 max-w-[85vw]">
            <Sidebar user={user} onLogout={handleLogout} onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="mb-6 flex items-center justify-between rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-black/5 backdrop-blur lg:hidden">
          <Logo to="/" />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-ink hover:bg-slate-100"
          >
            <MenuIcon />
          </button>
        </header>

        <main className="mx-auto max-w-6xl px-1 py-2 lg:px-4 lg:py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
