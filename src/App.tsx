import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useCoach } from "./hooks/useCoach";
import CoachPicker from "./pages/CoachPicker";
import AthletesPage from "./pages/AthletesPage";
import AttendancePage from "./pages/AttendancePage";
import TimingPage from "./pages/TimingPage";
import LaneTimingPage from "./pages/LaneTimingPage";
import LaneTimingSettingsPage from "./pages/LaneTimingSettingsPage";
import TimingSetupPage from "./pages/TimingSetupPage";
import CashPage from "./pages/CashPage";
import DashboardPage from "./pages/DashboardPage";
import BottomNav from "./components/BottomNav";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const { coach, selectCoach } = useCoach();

  if (!coach) {
    return <CoachPicker onSelect={selectCoach} />;
  }

  return (
    <>
      <div className="mx-auto max-w-lg min-h-screen">
        <Routes>
          <Route path="/" element={<Navigate to="/athletes" replace />} />
          <Route path="/athletes" element={<AthletesPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/timing/setup" element={<TimingSetupPage />} />
          <Route path="/timing" element={<TimingPage />} />
          <Route path="/timing/lane/:laneId" element={<LaneTimingPage />} />
          <Route path="/timing/lane/:laneId/settings" element={<LaneTimingSettingsPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <BottomNav />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
