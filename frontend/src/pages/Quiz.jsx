import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Quiz() {
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

  if (!userId) return null;

  return (
    <div>
      <h1>Quiz</h1>
      <p>Quiz content coming soon.</p>
    </div>
  );
}
