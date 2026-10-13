import { Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Forbidden from "../pages/Forbidden";

function RoleRoute({ allowedRoles }) {
  const { user } = useAuth();

  if (!allowedRoles.includes(user.role)) return <Forbidden />;

  return <Outlet />;
}

export default RoleRoute;
