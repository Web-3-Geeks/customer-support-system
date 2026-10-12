import Button from "../components/Button";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../utils/roles";

function Forbidden() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-extrabold tracking-tight text-coral-500">403</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">You don&apos;t have access to this page</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Your account doesn&apos;t have the role required to view this area. If you think this is a
        mistake, contact an administrator.
      </p>
      <Button to={getDashboardPath(user?.role)} className="mt-6">
        Back to my dashboard
      </Button>
    </div>
  );
}

export default Forbidden;
