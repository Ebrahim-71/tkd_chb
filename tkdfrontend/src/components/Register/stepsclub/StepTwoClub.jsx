import React, { useEffect, useState } from 'react';
import provincesData from '../provincesData.js';
import './ClubRegister.css';

import {
  apiFetch,
} from '../../../api/apiClient';

import {
  showGlobalMessage,
} from '../../../services/globalMessage';
const StepTwoClub = ({ data, onDataChange, onNext, onBack }) => {
  const [boards, setBoards] = useState([]);
  const [invalidFields, setInvalidFields] = useState([]);

  useEffect(() => {
    let active = true;

    const loadBoards = async () => {
      try {
        const res = await apiFetch(
          'https://api.chbtkd.ir/api/auth/form-data/',
          {
            method: 'GET',
            errorTitle:
              'دریافت لیست هیئت‌ها',
          }
        );

        if (!res.ok) {
          return;
        }

        const resData =
          await res
            .json()
            .catch(() => ({}));

        if (active) {
          setBoards(
            resData?.heyats || []
          );
        }
      } catch (err) {
        console.error(
          'CLUB_BOARDS_LOAD_ERROR',
          err
        );

        // apiFetch خطای شبکه را
        // در مودال سراسری نمایش داده است.
      }
    };

    loadBoards();

    return () => {
      active = false;
    };
  }, []);


const handleChange = (e) => {
  const { name, value } = e.target;

  if (name === 'province') {
    onDataChange({ province: value, county: '', city: '' });
  } else if (name === 'county') {
    onDataChange({ county: value, city: '' });
  } else if (name === 'tkd_board') {
    const intValue =
      parseInt(value, 10);
    onDataChange({ [name]: intValue });
    console.log("✅ فرم داده:", intValue, typeof intValue);  
  } else {
    onDataChange({ [name]: value });
  }
};


  const validate = () => {
  const required = ['province', 'tkd_board', 'county', 'city', 'phone', 'address'];
  const invalids = [];
  const errors = [];

  required.forEach(field => {
    if (!data[field]) {
      invalids.push(field);
      switch (field) {
        case 'province': errors.push('استان را وارد کنید.'); break;
        case 'tkd_board': errors.push('هیئت را انتخاب کنید.'); break;
        case 'county': errors.push('شهرستان را وارد کنید.'); break;
        case 'city': errors.push('شهر را وارد کنید.'); break;
        case 'phone': errors.push('شماره تماس را وارد کنید.'); break;
        case 'address': errors.push('آدرس را وارد کنید.'); break;
      }
            }
        });

        // شماره تماس: فقط عدد، 11 رقم، و با 09 یا 038 شروع شود
        if (data.phone && !/^0(9\d{9}|38\d{8})$/.test(data.phone)) {
            if (!invalids.includes('phone')) invalids.push('phone');
            errors.push('شماره تماس باید با 09 یا 038 شروع شده و ۱۱ رقم باشد.');
        }

        // آدرس: حداقل ۱۰ کاراکتر
        if (data.address && data.address.length < 10) {
            if (!invalids.includes('address')) invalids.push('address');
            errors.push('آدرس باید حداقل ۱۰ کاراکتر باشد.');
        }

        setInvalidFields(invalids);

        if (errors.length > 0) {
          showGlobalMessage({
            type: 'warning',
            title: 'اطلاعات مکان باشگاه ناقص است',
            messages: errors,
          });

          return false;
        }

        return true;
        };

        const handleNext = () => {
            if (validate()) onNext();
        };

        const currentCounties = data.province ? Object.keys(provincesData[data.province] || {}) : [];
        const currentCities = data.province && data.county
            ? provincesData[data.province][data.county] || []
            : [];

  return (
    <div className="step">
      <h2> اطلاعات مکان باشگاه</h2>

      <label>
        استان:
        <select
          name="province"
          value={data.province || ''}
          onChange={handleChange}
          className={invalidFields.includes('province') ? 'invalid' : ''}
          style={{ width: '104%' }}
        >
          <option value="">انتخاب کنید</option>
          {Object.keys(provincesData).map((prov) => (
            <option key={prov} value={prov}>{prov}</option>
          ))}
        </select>
      </label>

      <label>
        شهرستان:
        <select
          name="county"
          value={data.county || ''}
          onChange={handleChange}
          className={invalidFields.includes('county') ? 'invalid' : ''}
          style={{ width: '104%' }}
        >
          <option value="">انتخاب کنید</option>
          {currentCounties.map((county) => (
            <option key={county} value={county}>{county}</option>
          ))}
        </select>
      </label>

      <label>
        شهر:
        <select
          name="city"
          value={data.city || ''}
          onChange={handleChange}
          className={invalidFields.includes('city') ? 'invalid' : ''}
          style={{ width: '104%' }}
        >
          <option value="">انتخاب کنید</option>
          {currentCities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </label>

      <label>
        هیئت تکواندو:
        <select
          name="tkd_board"
          value={data.tkd_board || ''}
          onChange={handleChange}
          className={invalidFields.includes('tkd_board') ? 'invalid' : ''}
          style={{ width: '104%' }}
        >
          <option value="">انتخاب کنید</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>{board.name}</option>
          ))}
        </select>
      </label>

      <label>
        شماره تماس باشگاه:
        <input
            type="text"
            name="phone"
            value={data.phone || ''}
            maxLength="11"
            onChange={(e) => {
                const onlyNums = e.target.value.replace(/\D/g, '');
                onDataChange({ phone: onlyNums });
            }}
            className={invalidFields.includes('phone') ? 'invalid' : ''}
            />

      </label>

      <label>
        آدرس دقیق:
        <textarea
          name="address"
          value={data.address || ''}
          onChange={handleChange}
          className={invalidFields.includes('address') ? 'invalid' : ''}
        />
      </label>

      <div className="step-buttons">
        <button onClick={onBack}>مرحله قبل</button>
        <button onClick={handleNext}>مرحله بعد</button>
      </div>


    </div>
  );
};

export default StepTwoClub;
