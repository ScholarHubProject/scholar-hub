import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
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

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch {
    return null;
  }
};

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
    localStorage.removeItem("currentUser");
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
      localStorage.removeItem("currentUser");
      return children;
    }

    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return children;
};

function App() {
  const location = useLocation();
  const hideNavbar =
    location.pathname === "/" ||
    location.pathname === "/login" ||
    location.pathname === "/register";

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
      </Routes>
    </>
  );
}

export default App;
