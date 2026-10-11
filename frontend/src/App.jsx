import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import LandingLayout from "./layout/LandingLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Dashboard from "./pages/Dashboard";
import Quiz from "./pages/Quiz";
import StudyTime from "./pages/StudyTime";
import Review from "./pages/Review";
import Unwind from "./pages/Unwind";
import { AuthProvider, RequireAuth } from "./context/AuthContext";

function StudyRedirect() {
  const location = useLocation();
  return <Navigate to={`/questions${location.search}`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<LandingLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/upload" element={<Upload />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/quiz" element={<StudyRedirect />} />
            <Route path="/questions" element={<Quiz />} />
            <Route path="/study-time" element={<StudyTime />} />
            <Route path="/review" element={<Review />} />
            <Route path="/unwind" element={<Navigate to="/activities" replace />} />
            <Route path="/activities" element={<Unwind />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
