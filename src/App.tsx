import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useCoach } from "./hooks/useCoach";
import CoachPicker from "./pages/CoachPicker";
import AthletesPage from "./pages/AthletesPage";
import AthleteProfilePage from "./pages/AthleteProfilePage";
import AthletePublicPage from "./pages/AthletePublicPage";
import AttendancePage from "./pages/AttendancePage";
import TimingPage from "./pages/TimingPage";
import LaneTimingPage from "./pages/LaneTimingPage";
import LaneTimingSettingsPage from "./pages/LaneTimingSettingsPage";
import TimingSetupPage from "./pages/TimingSetupPage";
import CashPage from "./pages/CashPage";
import ResultsPage from "./pages/ResultsPage";
import AdminPresetsPage from "./pages/AdminPresetsPage";
import BottomNav from "./components/BottomNav";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function AppContent() {
  const { coach, selectCoach, logout } = useCoach();

  if (!coach) {
    return <CoachPicker onSelect={selectCoach} />;
  }

  return (
    <>
      <div className="mx-auto max-w-lg min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/athletes" replace />} />
          <Route path="/athletes" element={<AthletesPage onLogout={logout} />} />
          <Route path="/athletes/:id" element={<AthleteProfilePage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/timing/setup" element={<TimingSetupPage />} />
          <Route path="/timing" element={<TimingPage />} />
          <Route path="/timing/lane/:laneId" element={<LaneTimingPage />} />
          <Route path="/timing/lane/:laneId/settings" element={<LaneTimingSettingsPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/admin/presets" element={<AdminPresetsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <BottomNav />
    </>
  );
}

// Public routes (no auth)
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/athletes/:id/public" element={<AthletePublicPage />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/athletes/:id/public" element={<AthletePublicPage />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
