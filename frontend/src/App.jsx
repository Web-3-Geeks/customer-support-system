import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { ROLES } from "./utils/roles";
import PublicRoute from "./routes/PublicRoute";
import ProtectedRoute from "./routes/ProtectedRoute";
import RoleRoute from "./routes/RoleRoute";
import HomeRedirect from "./routes/HomeRedirect";
import DashboardLayout from "./components/DashboardLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CustomerDashboard from "./pages/CustomerDashboard";
import CustomerTickets from "./pages/CustomerTickets";
import NewTicket from "./pages/NewTicket";
import AgentDashboard from "./pages/AgentDashboard";
import AgentTickets from "./pages/AgentTickets";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTickets from "./pages/AdminTickets";
import TicketDetail from "./pages/TicketDetail";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import FullPageLoader from "./components/FullPageLoader";

// The charts library is big and only admins open this page, so it is loaded when it is first needed.
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route element={<RoleRoute allowedRoles={[ROLES.CUSTOMER]} />}>
            <Route path="/customer" element={<CustomerDashboard />} />
            <Route path="/customer/tickets" element={<CustomerTickets />} />
            <Route path="/customer/tickets/:id" element={<TicketDetail />} />
            <Route path="/customer/new-ticket" element={<NewTicket />} />
            <Route path="/customer/notifications" element={<Notifications />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={[ROLES.AGENT]} />}>
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/tickets" element={<AgentTickets />} />
            <Route path="/agent/tickets/:id" element={<TicketDetail />} />
            <Route path="/agent/notifications" element={<Notifications />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={[ROLES.ADMIN]} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/tickets" element={<AdminTickets />} />
            <Route path="/admin/tickets/:id" element={<TicketDetail />} />
            <Route path="/admin/notifications" element={<Notifications />} />
            <Route
              path="/admin/analytics"
              element={
                <Suspense fallback={<FullPageLoader />}>
                  <AdminAnalytics />
                </Suspense>
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
