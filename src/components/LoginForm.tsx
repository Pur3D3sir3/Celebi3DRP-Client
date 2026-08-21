import { useState } from "react";
import axios from "axios";

interface Props {
  onLogin: (token: string, user: any) => void;
  onSwitchToRegister: () => void;
}

export default function LoginForm({ onLogin, onSwitchToRegister }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/login", { username, password });
      onLogin(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error logging in");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
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
      <button type="submit">Login</button>
      <p>
        No account? <button type="button" onClick={onSwitchToRegister}>Register</button>
      </p>
    </form>
  );
}