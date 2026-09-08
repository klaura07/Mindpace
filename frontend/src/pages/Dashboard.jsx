import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [userId, setUserId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) {
      navigate("/login");
      return;
    }
    setUserId(id);
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("user_id");
    navigate("/login");
  }

  if (!userId) return null;

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Logged in as user #{userId}</p>
      <button onClick={() => navigate("/quiz")}>Start Quiz</button>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}
