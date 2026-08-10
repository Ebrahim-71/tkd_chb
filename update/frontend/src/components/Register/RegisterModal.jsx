// ✅ فایل: PlayerRegisterModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import './RegisterModal.css';
import { useNavigate } from 'react-router-dom';

import { apiFetch } from '../../api/apiClient';
import { showGlobalWarning } from '../../services/globalMessage';

const PlayerRegisterModal = ({ onClose, role }) => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(0);
  const inputRefs = useRef([]);
  const [cooldownActive, setCooldownActive] = useState(false);
  const navigate = useNavigate();

  
  // شمارش معکوس
  useEffect(() => {
    if (cooldownActive && timer > 0) {
      const countdown = setInterval(() => setTimer(prev => prev - 1), 1000);
      return () => clearInterval(countdown);
    }
    if (timer === 0 && cooldownActive) {
      setCooldownActive(false);
    }
  }, [cooldownActive, timer]);

  // اتوفوکوس و انتقال بین inputها از چپ به راست
  const handleCodeChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 3) inputRefs.current[index + 1].focus();
    if (newCode.every(d => d.length === 1)) verifyCode(newCode.join(''));
  };

  const sendPhone = async () => {
    if (!/^09\d{9}$/.test(phone)) {
      showGlobalWarning(
        'شماره موبایل معتبر نیست.',
        'شماره موبایل نامعتبر'
      );
      return;
    }

    if (cooldownActive) {
      showGlobalWarning(
        'لطفاً تا پایان شمارنده صبر کنید.',
        'ارسال کد'
      );
      return;
    }

    try {
      const res = await apiFetch(
        'https://api.chbtkd.ir/api/auth/send-code/',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            phone,
            role,
          }),

          errorTitle: 'ارسال کد تأیید',
        }
      );

      const data =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        // در صورت محدودیت ارسال، تایمر Backend حفظ شود.
        if (data?.retry_after) {
          const retryAfter = Math.max(
            0,
            parseInt(data.retry_after, 10) || 0
          );

          if (retryAfter > 0) {
            setStep(2);
            setTimer(retryAfter);
            setCooldownActive(true);
          }
        }

        // متن خطای Backend توسط apiFetch
        // در مودال سراسری نمایش داده شده است.
        return;
      }

      setStep(2);
      setTimer(180);
      setCooldownActive(true);

    } catch (err) {
      console.error(
        'REGISTER_SEND_CODE_ERROR',
        err
      );

      // خطای شبکه توسط apiFetch نمایش داده شده است.
    }
  };
  const getTitleFromRole = (role) => {
  switch (role) {
    case 'player':
      return 'بازیکن';
    case 'coach':
      return 'مربی | داور';
    case 'club':
      return 'باشگاه';
    case 'heyat':
      return 'هیئت';
    default:
      return 'کاربر';
  }
};

  const resendCode = () => {
    if (cooldownActive) {
      showGlobalWarning(
        'لطفاً تا پایان شمارنده صبر کنید.',
        'ارسال مجدد کد'
      );
      return;
    }

    sendPhone();
  };

  const verifyCode = async (codeStr) => {
    if (!/^\d{4}$/.test(codeStr)) {
      showGlobalWarning(
        'کد تأیید باید ۴ رقمی باشد.',
        'کد تأیید نامعتبر'
      );
      return;
    }

    try {
      const res = await apiFetch(
        'https://api.chbtkd.ir/api/auth/verify-code/',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            phone,
            code: codeStr,
          }),

          errorTitle: 'تأیید کد ثبت‌نام',
        }
      );

      const data =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        setCode(['', '', '', '']);

        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 0);

        // apiFetch متن خطای Backend را
        // در مودال سراسری نمایش داده است.
        return;
      }

      if (data?.message) {
        localStorage.setItem(
          'verifiedPhone',
          phone
        );

        navigate(
          `/register-${role || 'player'}`,
          {
            state: {
              role,
              phone,
            },
          }
        );

        return;
      }

      // برای حالتی که Backend پاسخ 200 بدهد
      // اما تأیید موفق نباشد.
      showGlobalWarning(
        data?.error ||
          data?.detail ||
          'کد تأیید صحیح نیست.',
        'کد تأیید نامعتبر'
      );

      setCode(['', '', '', '']);

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 0);

    } catch (err) {
      console.error(
        'REGISTER_VERIFY_CODE_ERROR',
        err
      );

      // خطای شبکه قبلاً توسط apiFetch نمایش داده شده است.
    }
  };


  return (
    <div className="modal-backdrop">
      <div className="modal-container animate-pop">
        <button className="close-btn" onClick={onClose}>&times;</button>
        {step === 1 && (
          <div className="modal-content">
            <h2>ثبت‌نام {getTitleFromRole(role)}</h2>

            <p className="subtext">لطفاً شماره موبایل خود را وارد نمایید</p>
            <input
              className="input-field"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="مثلاً 09123456789"
              dir="rtl"
            />
            <button className="action-btn" onClick={sendPhone} disabled={cooldownActive}>
              {cooldownActive ? `صبر کنید (${timer})` : 'ارسال کد'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="modal-content">
            <h2>کد تایید</h2>
            <p className="subtext">کد پیامک شده را وارد کنید</p>
            <div className="code-inputs" dir="ltr">
              {code.map((val, i) => (
                <input
                  key={i}
                  type="text"
                  maxLength="1"
                  ref={el => inputRefs.current[i] = el}
                  value={val}
                  onChange={e => handleCodeChange(e.target.value, i)}
                  className="code-box"
                  autoComplete="one-time-code"
                />
              ))}
            </div>
            {timer > 0 ? (
              <p className="timer">ارسال مجدد تا <strong>{timer}</strong> ثانیه</p>
            ) : (
              <button className="resend-btn" onClick={resendCode}>
                &#x21bb; ارسال مجدد کد
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerRegisterModal;
