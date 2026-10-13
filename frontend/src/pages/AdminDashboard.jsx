import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../api/adminApi";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../utils/getErrorMessage";
import { ROLES, ROLE_LABELS } from "../utils/roles";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import RoleBadge from "../components/RoleBadge";
import Alert from "../components/Alert";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import { SearchIcon, UsersIcon } from "../components/icons";
import { usePageTitle } from "../hooks/usePageTitle";

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AdminDashboard() {
  usePageTitle("Users");
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [query, setQuery] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    adminApi
      .getUsers()
      .then(({ data }) => {
        if (!ignore) setUsers(data.data.users);
      })
      .catch((error) => {
        if (!ignore) setLoadError(getErrorMessage(error));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError("");
    setReloadKey((key) => key + 1);
  };

  const counts = useMemo(
    () => ({
      total: users.length,
      customers: users.filter((u) => u.role === ROLES.CUSTOMER).length,
      agents: users.filter((u) => u.role === ROLES.AGENT).length,
      admins: users.filter((u) => u.role === ROLES.ADMIN).length,
    }),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
    );
  }, [users, query]);

  const handleRoleChange = async (target, newRole) => {
    if (newRole === target.role) return;

    setNotice(null);
    setUpdatingId(target._id);
    try {
      const { data } = await adminApi.updateUserRole(target._id, newRole);
      setUsers((prev) => prev.map((u) => (u._id === target._id ? data.data.user : u)));
      setNotice({
        type: "success",
        message: `${target.name} is now ${ROLE_LABELS[newRole]}.`,
      });
    } catch (error) {
      setNotice({ type: "error", message: getErrorMessage(error) });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="User management"
        subtitle="View everyone on the platform and manage their roles."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={counts.total} />
        <StatCard label="Customers" value={counts.customers} />
        <StatCard label="Agents" value={counts.agents} />
        <StatCard label="Admins" value={counts.admins} />
      </div>

      <section className="mt-8" aria-labelledby="users-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="users-heading" className="text-lg font-bold text-ink">
            All users
          </h2>
          <div className="relative w-full sm:w-72">
            <SearchIcon
              width={18}
              height={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search users"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-slate-500 focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20"
            />
          </div>
        </div>

        {notice && (
          <div className="mb-3">
            <Alert type={notice.type}>{notice.message}</Alert>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white/80 p-10 text-center text-sm text-muted ring-1 ring-black/5" role="status">
            Loading users...
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <Alert>{loadError}</Alert>
            <Button variant="ghost" onClick={handleRetry}>
              Try again
            </Button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={<UsersIcon width={24} height={24} />}
            title="No users found"
            text={query ? "No one matches your search. Try a different name or email." : "There are no users yet."}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Platform users and their roles</caption>
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-3 font-semibold">User</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Joined</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Change role</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u._id === currentUser._id;
                  return (
                    <tr key={u._id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3">
                        <p className="max-w-[16rem] truncate font-semibold text-ink">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs font-medium text-muted">(you)</span>}
                        </p>
                        <p className="max-w-[16rem] truncate text-xs text-muted">{u.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-5 py-3 text-muted">{formatDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value)}
                          disabled={isSelf || updatingId === u._id}
                          aria-label={`Role for ${u.name}`}
                          title={isSelf ? "You cannot change your own role" : undefined}
                          className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          {Object.values(ROLES).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default AdminDashboard;
