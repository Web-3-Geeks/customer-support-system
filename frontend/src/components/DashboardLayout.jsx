import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Sidebar from "./Sidebar";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";
import { useNotifications } from "../context/useNotifications";
import { MenuIcon } from "./icons";

function DashboardLayout() {
  const { user, logout } = useAuth();
  const { announcement } = useNotifications();
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lg"
      >
        Skip to main content
      </a>

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
        <header className="mb-6 flex items-center justify-between gap-2 rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-black/5 backdrop-blur lg:mb-2 lg:justify-end lg:bg-transparent lg:px-4 lg:py-0 lg:shadow-none lg:ring-0 lg:backdrop-blur-none">
          <div className="lg:hidden">
            <Logo to="/" />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-ink hover:bg-slate-100 lg:hidden"
            >
              <MenuIcon />
            </button>
          </div>
        </header>

        {/* Screen readers hear about new notifications without the page moving. */}
        <div role="status" aria-live="polite" className="sr-only">
          <span key={announcement.id}>{announcement.text}</span>
        </div>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-1 py-2 focus:outline-none lg:px-4 lg:py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
