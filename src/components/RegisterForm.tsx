import { useState } from "react";
import axios from "axios";

interface Props {
  onRegister: (token: string) => void;
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onRegister, onSwitchToLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/register", { username, password });
      onRegister(res.data.token);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error registering");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button type="submit">Register</button>
      <p>
        Have account? <button type="button" onClick={onSwitchToLogin}>Login</button>
      </p>
    </form>
  );
}