import { Link, Route, Routes } from "react-router-dom";
import CompaniesPage from "./pages/CompaniesPage";
import DashboardPage from "./pages/DashboardPage";
import NewJobPage from "./pages/NewJobPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <div>
      <nav>
        <Link to="/">Dashboard</Link>
        <Link to="/jobs/new">New Job</Link>
        <Link to="/companies">Companies</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs/new" element={<NewJobPage />} />
        <Route path="/jobs/:id/review" element={<ReviewPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
