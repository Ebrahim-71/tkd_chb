import React, { useState, useEffect, useRef } from 'react';
import '../Register/RegisterModal.css';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

const LoginModal = ({ role, onClose }) => {
  const navigate = useNavigate();
  const inputRefs = useRef([]);
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown && timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
    if (timer === 0 && cooldown) setCooldown(false);
  }, [cooldown, timer]);

  const getRoleLabel = () => {
    const labels = {
      player: 'بازیکن',
      coach: 'مربی',
      referee: 'داور',
      both: 'مربی و داور',
      club: 'باشگاه',
      heyat: 'هیأت',
    };
    return labels[role] || 'کاربر';
  };

  const handleCodeChange = (val, idx) => {
    if (!/^\d?$/.test(val)) return;
    const newCode = [...code];
    newCode[idx] = val;
    setCode(newCode);
    if (val && idx < 3) inputRefs.current[idx + 1]?.focus();
    if (newCode.every((d) => d.length === 1)) verifyCode(newCode.join(''));
  };

  const sendCode = () => {
    setError('');
    if (!/^09\d{9}$/.test(phone)) return setError('شماره موبایل معتبر نیست.');
    if (cooldown) return setError('لطفاً کمی صبر کنید.');

    fetch('http://localhost:8000/api/auth/login/send-code/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })))
      .then(({ ok, status, data }) => {
        if (ok || (status === 429 && data.retry_after)) {
          setStep(2);
          setTimer(data.retry_after || 180);
          setCooldown(true);
          if (data.error) setError(data.error);
        } else {
          setError(data.error || 'خطا در ارسال کد.');
        }
      })
      .catch(() => setError('خطا در اتصال به سرور.'));
  };

  const verifyCode = (codeStr) => {
    setError('');
    fetch('http://localhost:8000/api/auth/login/verify-code/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: codeStr, role }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data.access && data.role) {
          localStorage.setItem(`${data.role}_token`, data.access);
          localStorage.setItem('user_role', data.role);
          onClose();
          navigate(`/dashboard/${data.role}`);
        } else {
          setError(data.error || 'کد نادرست است.');
          setCode(['', '', '', '']);
          inputRefs.current[0]?.focus();
        }
      })
      .catch(() => setError('خطا در تأیید کد.'));
  };

  const handleHeyatLogin = () => {
    setError('');
    if (!username || !password) return setError('نام کاربری و رمز عبور الزامی است.');
    console.log(JSON.stringify({ username, password }));

    fetch('http://localhost:8000/api/auth/login/board/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data.access) {
          const r = data.role === 'board' ? 'heyat' : data.role;
          localStorage.setItem(`${r}_token`, data.access);
          localStorage.setItem('user_role', r);
          onClose();
          navigate(`/dashboard/${r}`);
        } else {
          setError(data.error || 'نام کاربری یا رمز اشتباه است.');
        }
      })
      .catch(() => setError('خطا در ورود.'));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container animate-pop">
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>

        {role === 'heyat' ? (
          <div className="modal-content">
            <h2>ورود هیأت</h2>
            <p className="subtext">نام کاربری و رمز عبور خود را وارد کنید</p>
            <input
              className="input-field"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="نام کاربری"
            />
            <div className="password-container">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور"
                className="password-input"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button className="action-btn" onClick={handleHeyatLogin}>
              ورود
            </button>
          </div>
        ) : step === 1 ? (
          <div className="modal-content">
            <h2>ورود {getRoleLabel()}</h2>
            <p className="subtext">شماره موبایل خود را وارد کنید</p>
            <input
              className="input-field"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="مثلاً 09123456789"
              dir="rtl"
            />
            {error && <p className="error-msg">{error}</p>}
            <button className="action-btn" onClick={sendCode}>
              ارسال کد ورود
            </button>
          </div>
        ) : (
          <div className="modal-content">
            <h2>کد ورود</h2>
            <p className="subtext">کد ۴ رقمی پیامک‌شده را وارد کنید</p>
            <div className="code-inputs" dir="ltr">
              {code.map((val, i) => (
                <input
                  key={i}
                  type="text"
                  maxLength="1"
                  ref={(el) => (inputRefs.current[i] = el)}
                  value={val}
                  onChange={(e) => handleCodeChange(e.target.value, i)}
                  className="code-box"
                />
              ))}
            </div>
            {error && <p className="error-msg">{error}</p>}
            {timer > 0 ? (
              <p className="timer">ارسال مجدد در {timer} ثانیه</p>
            ) : (
              <button className="resend-btn" onClick={sendCode}>
                ارسال مجدد
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginModal;
