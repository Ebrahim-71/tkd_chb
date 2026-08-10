import React, { useEffect, useState } from 'react';
import PaginatedList from '../../common/PaginatedList';
import { useNavigate } from 'react-router-dom';
import PersonalInfoForm from '../panel/maincontentpanel/PersonalInfoForm';
import "./dashboard.css";

import {
  apiFetch,
} from '../../../api/apiClient';

import {
  showGlobalMessage,
} from '../../../services/globalMessage';

const MainContent = ({ selectedSection }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const role = localStorage.getItem("user_role");
  const token = localStorage.getItem(`${role}_token`);

  const endpoints = {
    matches: `https://api.chbtkd.ir/api/dashboard/${role}/matches/`,
    exams: `https://api.chbtkd.ir/api/dashboard/${role}/exams/`,
    courses: `https://api.chbtkd.ir/api/dashboard/${role}/courses/`,
    circulars: `https://api.chbtkd.ir/api/dashboard/${role}/circulars/`,
    news: `https://api.chbtkd.ir/api/dashboard/${role}/news/`,
    profile: `https://api.chbtkd.ir/api/auth/dashboard/${role}/`,
  };

  const fetchData = async () => {
    if (
      !selectedSection ||
      !role ||
      !token
    ) {
      showGlobalMessage({
        type: 'warning',
        title: 'دسترسی نامعتبر',
        message:
          'اطلاعات ورود معتبر نیست. لطفاً دوباره وارد حساب کاربری شوید.',
      });

      return;
    }


    const url =
      endpoints[selectedSection];


    if (!url) {
      showGlobalMessage({
        type: 'warning',
        title: 'بخش نامعتبر',
        message:
          'بخش انتخاب‌شده معتبر نیست.',
      });

      return;
    }


    setLoading(true);


    try {
      const res = await apiFetch(
        url,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Bearer ${token}`,
          },

          // چون 401 در این فایل
          // رفتار اختصاصی دارد،
          // خطا را اینجا مدیریت می‌کنیم.
          globalError: false,
        }
      );


      const responseData =
        await res
          .json()
          .catch(() => null);


      if (res.status === 401) {
        localStorage.removeItem(
          `${role}_token`
        );

        localStorage.removeItem(
          'user_role'
        );


        showGlobalMessage({
          type: 'warning',
          title: 'پایان اعتبار ورود',
          message:
            'نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد شوید.',
        });


        navigate('/');
        return;
      }


      if (!res.ok) {
        const serverMessage =
          responseData?.detail ||
          responseData?.error ||
          responseData?.message;


        showGlobalMessage({
          type: 'error',
          title: 'خطا در دریافت اطلاعات',
          message:
            serverMessage ||
            'دریافت اطلاعات از سرور انجام نشد.',
        });

        return;
      }


      setItems(
        Array.isArray(responseData)
          ? responseData
          : responseData
          ? [responseData]
          : []
      );

    } catch (err) {
      console.error(
        'MAIN_CONTENT_FETCH_ERROR',
        err
      );


      showGlobalMessage({
        type: 'error',
        title: 'خطا در ارتباط با سرور',
        message:
          'ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت را بررسی کرده و دوباره تلاش کنید.',
      });

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSection && selectedSection !== "profile") {
      fetchData();
    }
  }, [selectedSection]);

  if (!selectedSection) return <div className="maincontent">یک بخش را انتخاب کنید</div>;

  // 🔹 اگر بخش پروفایل انتخاب شده، فرم رو نمایش بده
  if (selectedSection === "profile") {
    return (
      <div className="main-content">
        <PersonalInfoForm />
      </div>
    );
  }

  const renderItem = (item) => (
    <div className="item-card">
      <h4>{item.title || "بدون عنوان"}</h4>
      <p>{item.description || item.summary || "بدون توضیح"}</p>
    </div>
  );

  return (
    <div className="main-content">
      <PaginatedList items={items} renderItem={renderItem} itemsPerPage={3} />
    </div>
  );
};

export default MainContent;
