import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../utils/roles";
import FullPageLoader from "../components/FullPageLoader";

function PublicRoute() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to={getDashboardPath(user.role)} replace />;

  return <Outlet />;
}

export default PublicRoute;
