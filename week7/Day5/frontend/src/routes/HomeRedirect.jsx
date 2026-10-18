import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../utils/roles";
import FullPageLoader from "../components/FullPageLoader";

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader />;

  return <Navigate to={user ? getDashboardPath(user.role) : "/login"} replace />;
}

export default HomeRedirect;
