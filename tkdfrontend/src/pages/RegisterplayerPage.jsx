import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../api/apiClient';

import {
  showGlobalSuccess,
  showGlobalWarning,
} from '../services/globalMessage';
import StepOnePlayer from '../components/Register/stepsplayer/StepOnePlayer';
import StepTwoPlayer from '../components/Register/stepsplayer/StepTwoPlayer';
import StepThreePlayer from '../components/Register/stepsplayer/StepThreePlayer';

import sampleImg from '../assets/img/register-player.jpg';
import '../components/Register/stepsplayer/PlayerRegister.css';


      
const RegisterplayerPage = () => {
  const location = useLocation();

  const phoneFromState = location.state?.phone || '';
  const phone = phoneFromState || localStorage.getItem('verifiedPhone') || '';

  useEffect(() => {
    if (phoneFromState) {
      localStorage.setItem('verifiedPhone', phoneFromState);
    }
  }, [phoneFromState]);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    father_name: '',
    national_code: '',
    birth_date: '',
    gender: '',
    province: '',
    county: '',
    city: '',
    address: '',
    tkd_board: '',

    belt_grade: '',
    belt_certificate_number: '',
    belt_certificate_date: '',

    is_coach: false,
    coach_level: '',
    coach_level_International: '',
    is_referee: false,

    kyorogi: false,
    poomseh: false,
    hanmadang: false,
    kyorogi_level: '',
    kyorogi_level_International: '',
    poomseh_level: '',
    poomseh_level_International: '',
    hanmadang_level: '',
    hanmadang_level_International: '',
    club_names: [],
    profile_image: null,

    phone: phone,
    role: 'player',

    coachGradeNational: '',
    coachGradeIntl: '',
    refereeTypes: {},
    selectedClubs: [],
    coach: '',
    coachFullName: '',
    customCoachName: '',
    belt: '',
    beltNumber: '',
    beltDate: '',
    confirmInfo: false,
  });



  const handleDataChange = (newData) => {
    setFormData((prev) => ({ ...prev, ...newData }));
  };

  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  const handleSubmit = async () => {
    const form = new FormData();

    Object.entries(formData).forEach(
      ([key, value]) => {
        if (value instanceof File) {
          form.append(key, value);
        } else if (
          typeof value === 'object' &&
          value !== null
        ) {
          form.append(
            key,
            JSON.stringify(value)
          );
        } else {
          form.append(key, value);
        }
      }
    );

    const csrfToken =
      getCookie('csrftoken');

    try {
      const res = await apiFetch(
        'https://api.chbtkd.ir/api/auth/register-player/',
        {
          method: 'POST',

          body: form,

          headers: {
            'X-CSRFToken': csrfToken,
          },

          credentials: 'include',

          errorTitle:
            'ثبت‌نام بازیکن',
        }
      );

      if (!res.ok) {
        // خطا و جزئیات Backend
        // توسط apiFetch نمایش داده شده است.
        return;
      }

      const data =
        await res
          .json()
          .catch(() => null);

      if (!data) {
        showGlobalWarning(
          'پاسخ معتبری از سرور دریافت نشد.',
          'خطای پاسخ سرور'
        );
        return;
      }

      if (data.status === 'ok') {
        localStorage.removeItem(
          'verifiedPhone'
        );

        showGlobalSuccess(
          data.message ||
            'اطلاعات شما با موفقیت ثبت شد و در انتظار تأیید هیئت استان است.',
          'ثبت‌نام موفق',
          () => {
            window.location.href = '/';
          }
        );

        return;
      }

      showGlobalWarning(
        data.message ||
          'خطایی در ثبت‌نام رخ داد.',
        'ثبت‌نام ناموفق'
      );

    } catch (err) {
      console.error(
        'REGISTER_PLAYER_ERROR',
        err
      );

      // خطای شبکه توسط apiFetch
      // در مودال سراسری نمایش داده شده است.
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepOnePlayer data={formData} onDataChange={handleDataChange} onNext={() => setStep(2)} />;
      case 2:
        return <StepTwoPlayer data={formData} onDataChange={handleDataChange} onNext={() => setStep(3)} onBack={() => setStep(1)} />;
      case 3:
        return <StepThreePlayer data={formData} onDataChange={handleDataChange} onBack={() => setStep(2)} onSubmit={handleSubmit} />;
      default:
        return null;
    }
  };

  return (
    <div className="register-page">
      <div className="register-form-section">{renderStep()}</div>
      <div className="register-image-section">
        <img src={sampleImg} alt="register visual" />
      </div>

    
    </div>
  );
};

export default RegisterplayerPage;
