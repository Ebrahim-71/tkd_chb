// src/components/auth/LoginModal.jsx
import React, { useState } from "react";
import "./LoginModal.css";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  "http://localhost:8000";

const LoginModal = ({ onClose }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!username || !password) return setError("نام کاربری و رمز عبور الزامی است.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "نام کاربری یا رمز عبور نادرست است.");

      const token = data.access;
      const role = data.role || "player";
      localStorage.setItem(`${role}_token`, token);
      localStorage.setItem("user_role", role);

      onClose?.();
      navigate(`/dashboard/${role}`);
    } catch (err) {
      setError(err.message || "مشکلی پیش آمد.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-backdrop">
      <div className="login-modal-container" dir="rtl" role="dialog" aria-modal="true">
        <button className="login-close-btn" onClick={onClose} aria-label="بستن">
          &times;
        </button>

        <div className="login-modal-content">
          <h2>ورود به پنل کاربری</h2>
          <p className="login-subtext">
            لطفاً نام کاربری و رمز عبور را وارد کنید.
          </p>

          <form onSubmit={handleLogin} className="login-form" noValidate>
            <input
              className="login-input-field"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="نام کاربری (شماره موبایل)"
              dir="ltr"
              autoComplete="username"
            />

            <div className="login-password-container">
              <input
                className="login-password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور (کد ملی)"
                dir="ltr"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="نمایش/پنهان کردن رمز"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p className="login-error-msg">{error}</p>}

            <button className="login-action-btn" type="submit" disabled={loading}>
              {loading ? "در حال ورود..." : "ورود"}
            </button>
          </form>

          <button className="login-resend-btn" onClick={() => alert("بخش فراموشی رمز در حال توسعه است.")}>
            فراموشی رمز عبور
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
