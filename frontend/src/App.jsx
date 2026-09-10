import { Route, Routes } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Dashboard from "./pages/Dashboard";
import Quiz from "./pages/Quiz";
import Review from "./pages/Review";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/review" element={<Review />} />
      </Route>
    </Routes>
  );
}

export default App;
