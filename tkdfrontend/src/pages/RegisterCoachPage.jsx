import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { apiFetch } from '../api/apiClient';

import {
  showGlobalMessage,
  showGlobalSuccess,
  showGlobalError,
} from '../services/globalMessage';

import StepOneCoach from '../components/Register/stepscoach/StepOneCoach';
import StepTwoCoach from '../components/Register/stepscoach/StepTwoCoach';
import StepThreeCoach from '../components/Register/stepscoach/StepThreeCoach';
import StepFourCoach from '../components/Register/stepscoach/StepFourCoach';

import sampleImg from '../assets/img/register-coach.jpg';
import '../components/Register/stepscoach/CoachRegister.css';


// تابع تبدیل نام فیلدها به فارسی
const translateField = (field) => {
  const fieldMap = {
    first_name: 'نام',
    last_name: 'نام خانوادگی',
    father_name: 'نام پدر',
    national_code: 'کد ملی',
    phone: 'شماره موبایل',
    birth_date: 'تاریخ تولد',
    gender: 'جنسیت',
    province: 'استان',
    county: 'شهرستان',
    city: 'شهر',
    address: 'آدرس',
    tkd_board: 'هیئت',
    belt_grade: 'کمربند',
    belt_certificate_number: 'شماره مدرک',
    belt_certificate_date: 'تاریخ مدرک',
    profile_image: 'عکس پروفایل',
    coach_level: 'درجه مربیگری ملی',
    coach_level_International: 'درجه مربیگری بین‌المللی',
    confirm_info: 'تأیید اطلاعات',
    refereeTypes: 'اطلاعات داوری',
    selectedClubs: 'باشگاه‌ها',
  };

  return fieldMap[field] || field;
};

// ساخت پیام خطا از پاسخ سرور
const parseServerErrors = (errors) => {
  const messages = [];

  for (const field in errors || {}) {
    const fieldErrors = errors[field];

    if (Array.isArray(fieldErrors)) {
      fieldErrors.forEach((err) => {
        messages.push(
          `${translateField(field)}: ${err}`
        );
      });
    } else if (fieldErrors) {
      messages.push(
        `${translateField(field)}: ${fieldErrors}`
      );
    }
  }

  return messages;
};

const RegisterCoachPage = () => {
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

    is_coach: true,
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
    role: 'coach',

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

  const getCookie = (name) => {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith(name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  };

const handleSubmit = async () => {
  const form = new FormData();

  const preparedData = {
    ...formData,
  };


  // مربی دیگر
  if (preparedData.coach === "other") {
    preparedData.coach = null;
    preparedData.coach_name =
      preparedData.customCoachName;
  } else {
    const coachId =
      Number(preparedData.coach);

    preparedData.coach =
      Number.isFinite(coachId)
        ? coachId
        : null;

    delete preparedData.coach_name;
  }

  delete preparedData.customCoachName;


  // این فیلدها در Backend به صورت JSON دریافت می‌شوند
  preparedData.selectedClubs =
    JSON.stringify(
      preparedData.selectedClubs || []
    );

  preparedData.refereeTypes =
    JSON.stringify(
      preparedData.refereeTypes || {}
    );


  Object.entries(preparedData).forEach(
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
      } else if (
        value !== undefined &&
        value !== null
      ) {
        form.append(key, value);
      }
    }
  );


  const csrfToken =
    getCookie('csrftoken');


  try {
    const res = await apiFetch(
      'https://api.chbtkd.ir/api/auth/register-coach/',
      {
        method: 'POST',

        body: form,

        headers: {
          'X-CSRFToken': csrfToken,
        },

        credentials: 'include',

        // اینجا خطا را خودمان پردازش می‌کنیم
        // تا نام فیلدها فارسی نمایش داده شود.
        globalError: false,
      }
    );


    const contentType =
      res.headers.get(
        'content-type'
      ) || '';

    const isJson =
      contentType.includes(
        'application/json'
      );

    const data = isJson
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => '');


    if (!res.ok) {
      if (
        isJson &&
        data?.errors
      ) {
        const messages =
          parseServerErrors(
            data.errors
          );

        showGlobalMessage({
          type: 'error',
          title: 'خطا در ثبت‌نام مربی',
          messages:
            messages.length
              ? messages
              : [
                  'اطلاعات ارسال‌شده معتبر نیست.',
                ],
        });

        return;
      }


      const serverMessage =
        isJson
          ? (
              data?.detail ||
              data?.error ||
              data?.message
            )
          : null;


      showGlobalMessage({
        type: 'error',
        title: 'خطا در ثبت‌نام مربی',
        message:
          serverMessage ||
          'ثبت‌نام انجام نشد. لطفاً اطلاعات واردشده را بررسی کنید.',
      });

      return;
    }


    if (data?.status === 'ok') {
      localStorage.removeItem(
        'verifiedPhone'
      );

      showGlobalSuccess(
        data.message ||
          'اطلاعات شما ثبت شد و در انتظار تأیید هیئت استان است.',
        'ثبت‌نام موفق',
        () => {
          window.location.href = '/';
        }
      );

      return;
    }


    showGlobalMessage({
      type: 'warning',
      title: 'ثبت‌نام تکمیل نشد',
      message:
        data?.message ||
        'خطایی در ثبت‌نام رخ داد.',
    });

  } catch (err) {
    console.error(
      'REGISTER_COACH_ERROR',
      err
    );

    showGlobalError(
      err,
      {
        title:
          'خطا در ارتباط با سرور',
      }
    );
  }
};


  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepOneCoach data={formData} onDataChange={handleDataChange} onNext={() => setStep(2)} />;
      case 2:
        return (
          <StepTwoCoach
            data={formData}
            onDataChange={handleDataChange}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        );
      case 3:
        return (
          <StepThreeCoach
            data={formData}
            onDataChange={handleDataChange}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        );
      case 4:
        return (
          <StepFourCoach
            data={formData}
            onDataChange={handleDataChange}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
          />
        );
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

export default RegisterCoachPage;
