import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import StudentDashboard from "./pages/StudentDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ManageScholarship from "./pages/ManageScholarship";
import ManageApplicants from "./pages/ManageApplicants";
import ApplicationForm from "./pages/ApplicationForm";
import Notifications from "./pages/Notifications";
import Reports from "./pages/Reports";
import Announcements from "./pages/Announcements";
import ScholarshipPage from "./pages/ScholarshipPage";
import TrackStatus from "./pages/TrackStatus";
import { getSavedSettings } from "./settings";
import { clearSession, getStoredUser, isLoggedIn } from "./api";

// These guards only decide what to render. They are a convenience, not a
// security boundary: the cached user lives in localStorage and the person
// sitting at the browser can edit it. Every endpoint enforces the same rules
// server side from the signed token, so faking a role here changes the view
// and nothing else.
const getCurrentUser = () => (isLoggedIn() ? getStoredUser() : null);

const getDashboardPath = (role) => {
  const settings = getSavedSettings();

  if (role === "Student" && settings.defaultDashboard === "Scholarships") {
    return "/scholarships";
  }

  return role === "Admin" ? "/admin-dashboard" : "/student-dashboard";
};

const RoleRoute = ({ allowedRole, children }) => {
  const user = getCurrentUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.role) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  if (user.role !== allowedRole) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return children;
};

const LoginRoute = ({ children }) => {
  const user = getCurrentUser();

  if (user) {
    if (!user.role) {
      clearSession();
      return children;
    }

    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return children;
};

function App() {
  const location = useLocation();
  const hideNavbar = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ].includes(location.pathname);

  return (
    <>
      {!hideNavbar && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/login"
          element={
            <LoginRoute>
              <Login />
            </LoginRoute>
          }
        />

        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/student-dashboard"
          element={
            <RoleRoute allowedRole="Student">
              <StudentDashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/scholarships"
          element={
            <RoleRoute allowedRole="Student">
              <ScholarshipPage />
            </RoleRoute>
          }
        />

        <Route
          path="/application-form"
          element={
            <RoleRoute allowedRole="Student">
              <ApplicationForm />
            </RoleRoute>
          }
        />

        <Route
          path="/track-status"
          element={
            <RoleRoute allowedRole="Student">
              <TrackStatus />
            </RoleRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <RoleRoute allowedRole="Student">
              <Notifications />
            </RoleRoute>
          }
        />

        <Route
          path="/admin-dashboard"
          element={
            <RoleRoute allowedRole="Admin">
              <AdminDashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/manage-scholarship"
          element={
            <RoleRoute allowedRole="Admin">
              <ManageScholarship />
            </RoleRoute>
          }
        />

        <Route
          path="/manage-applicants"
          element={
            <RoleRoute allowedRole="Admin">
              <ManageApplicants />
            </RoleRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <RoleRoute allowedRole="Admin">
              <Reports />
            </RoleRoute>
          }
        />

        <Route
          path="/announcements"
          element={
            <RoleRoute allowedRole="Admin">
              <Announcements />
            </RoleRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
