import React, { useState } from 'react';

import StepOneClub from '../components/Register/stepsclub/StepOneClub';
import StepTwoClub from '../components/Register/stepsclub/StepTwoClub';
import StepThreeClub from '../components/Register/stepsclub/StepThreeClub';

import sampleImg from '../assets/img/register-cover.jpg';
import '../components/Register/stepsclub/ClubRegister.css';

import { apiFetch } from '../api/apiClient';

import {
  showGlobalMessage,
  showGlobalSuccess,
} from '../services/globalMessage';


const translateClubField = (field) => {
  const fieldMap = {
    club_name: 'نام باشگاه',
    founder_name: 'نام مؤسس',
    founder_national_code: 'کد ملی مؤسس',
    founder_phone: 'شماره موبایل مؤسس',
    club_type: 'نوع باشگاه',
    activity_description: 'شرح فعالیت',
    province: 'استان',
    county: 'شهرستان',
    city: 'شهر',
    tkd_board: 'هیئت تکواندو',
    phone: 'شماره تماس باشگاه',
    address: 'آدرس',
    license_number: 'شماره مجوز',
    federation_id: 'شناسه فدراسیون',
    license_image: 'تصویر مجوز',
    confirm_info: 'تأیید اطلاعات',
  };

  return fieldMap[field] || field;
};


const parseClubErrors = (errors) => {
  const messages = [];

  Object.entries(
    errors || {}
  ).forEach(([field, value]) => {
    const fieldTitle =
      translateClubField(field);

    if (Array.isArray(value)) {
      value.forEach((item) => {
        messages.push(
          `${fieldTitle}: ${item}`
        );
      });

      return;
    }

    if (
      value !== null &&
      value !== undefined &&
      value !== ''
    ) {
      messages.push(
        `${fieldTitle}: ${value}`
      );
    }
  });

  return messages;
};


const RegisterClubPage = () => {
  const [step, setStep] = useState(1);

  const verifiedPhone = localStorage.getItem('verifiedPhone') || '';

  const [formData, setFormData] = useState({
    club_name: '',
    founder_name: '',
    founder_national_code: '',
    founder_phone: verifiedPhone,
    club_type: '',
    activity_description: '',
    province: '',
    county: '',
    city: '',
    tkd_board: '',
    phone: '',
    address: '',
    license_number: '',
    federation_id: '',
    license_image: null,
    confirm_info: false,
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
        if (cookie.substring(0, name.length + 1) === name + '=') {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  };

  const handleSubmit = async () => {
    const form = new FormData();

    Object.entries(formData).forEach(
      ([key, value]) => {
        if (
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
        'https://api.chbtkd.ir/api/auth/register-club/',
        {
          method: 'POST',

          body: form,

          headers: {
            'X-CSRFToken': csrfToken,
          },

          credentials: 'include',

          // خطا را اینجا خودمان پردازش می‌کنیم
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
        ? await res
            .json()
            .catch(() => ({}))
        : await res
            .text()
            .catch(() => '');


      if (!res.ok) {
        if (
          isJson &&
          data?.errors
        ) {
          const messages =
            parseClubErrors(
              data.errors
            );

          showGlobalMessage({
            type: 'error',
            title: 'خطا در ثبت باشگاه',
            messages:
              messages.length
                ? messages
                : [
                    'اطلاعات واردشده معتبر نیست.',
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
          title: 'خطا در ثبت باشگاه',
          message:
            serverMessage ||
            'ثبت باشگاه انجام نشد. لطفاً اطلاعات واردشده را بررسی کنید.',
        });

        return;
      }


      if (
        data?.status === 'ok'
      ) {
        localStorage.removeItem(
          'verifiedPhone'
        );

        showGlobalSuccess(
          data.message ||
            'باشگاه با موفقیت ثبت شد و در انتظار تأیید هیئت استان است.',
          'ثبت باشگاه موفق',
          () => {
            window.location.href = '/';
          }
        );

        return;
      }


      showGlobalMessage({
        type: 'warning',
        title: 'ثبت باشگاه تکمیل نشد',
        message:
          data?.message ||
          'خطایی در ثبت باشگاه رخ داد.',
      });

    } catch (err) {
      console.error(
        'REGISTER_CLUB_ERROR',
        err
      );

      showGlobalMessage({
        type: 'error',
        title: 'خطا در ارتباط با سرور',
        message:
          'ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت را بررسی کرده و دوباره تلاش کنید.',
      });
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <StepOneClub
            data={formData}
            onDataChange={handleDataChange}
            onNext={() => setStep(2)}
          />
        );
      case 2:
        return (
          <StepTwoClub
            data={formData}
            onDataChange={handleDataChange}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        );
      case 3:
        return (
          <StepThreeClub
            data={formData}
            onDataChange={handleDataChange}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
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

export default RegisterClubPage;
