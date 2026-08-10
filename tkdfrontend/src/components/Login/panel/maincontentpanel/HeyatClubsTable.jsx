// src/components/Login/panel/maincontentpanel/HeyatClubsTable.jsx

import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import axios from "axios";
import { useNavigate } from "react-router-dom";

import PaginatedList from "../../../common/PaginatedList";

import {
  showGlobalError,
  showGlobalWarning,
} from "../../../../services/globalMessage";

import "./HeyatClubsTable.css";


const API_BASE =
  "https://api.chbtkd.ir";


const HeyatClubsTable = () => {
  const [clubs, setClubs] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);


  const navigate =
    useNavigate();


  const token =
    localStorage.getItem(
      "heyat_token"
    );


  // ==============================
  // مدیریت پایان نشست کاربر
  // ==============================

  const handleUnauthorized =
    useCallback(() => {
      localStorage.removeItem(
        "heyat_token"
      );

      localStorage.removeItem(
        "user_role"
      );


      showGlobalWarning(
        "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",
        "پایان اعتبار ورود"
      );


      navigate("/");
    }, [navigate]);


  // ==============================
  // مدیریت خطای API
  // ==============================

  const handleApiError =
    useCallback(
      (err) => {
        if (
          axios.isCancel(err) ||
          err?.code ===
            "ERR_CANCELED" ||
          err?.name ===
            "CanceledError"
        ) {
          return;
        }


        console.error(
          "HEYAT_CLUBS_LOAD_ERROR",
          err
        );


        if (
          err?.response?.status ===
          401
        ) {
          handleUnauthorized();
          return;
        }


        showGlobalError(
          err,
          {
            title:
              "خطا در دریافت لیست باشگاه‌ها",
          }
        );
      },
      [handleUnauthorized]
    );


  // ==============================
  // دریافت باشگاه‌ها
  // ==============================

  useEffect(() => {
    if (!token) {
      showGlobalWarning(
        "اطلاعات ورود هیئت یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
        "نیاز به ورود مجدد"
      );

      navigate("/");

      return undefined;
    }


    const controller =
      new AbortController();


    const fetchClubs =
      async () => {
        try {
          setLoading(true);


          const params = {};


          if (search.trim()) {
            params.search =
              search.trim();
          }


          const res =
            await axios.get(
              `${API_BASE}/api/auth/heyat/clubs/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                params,

                signal:
                  controller.signal,

                // خطا را همین فایل
                // مدیریت می‌کند.
                // بنابراین interceptor
                // نباید Modal دوم بسازد.
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          const responseData =
            res?.data;


          // API ممکن است مستقیم
          // آرایه برگرداند.
          if (
            Array.isArray(
              responseData
            )
          ) {
            setClubs(
              responseData
            );

            return;
          }


          // پشتیبانی از پاسخ
          // صفحه‌بندی‌شده DRF
          if (
            Array.isArray(
              responseData?.results
            )
          ) {
            setClubs(
              responseData.results
            );

            return;
          }


          setClubs([]);

        } catch (err) {
          handleApiError(
            err
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    // Debounce جستجو
    const delay =
      setTimeout(
        fetchClubs,
        300
      );


    return () => {
      clearTimeout(
        delay
      );

      controller.abort();
    };

  }, [
    search,
    token,
    navigate,
    handleApiError,
  ]);


  // ==============================
  // Render
  // ==============================

  return (
    <div className="heyat-clubs-wrapper">

      <h2>
        لیست باشگاه‌های هیئت
      </h2>


      {/* ==========================
          جستجو
      ========================== */}

      <div className="heyat-clubs-filters">
        <input
          type="text"
          className="search-input"
          placeholder="جستجو بر اساس نام یا مدیر باشگاه"
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />
      </div>


      {/* ==========================
          جدول
      ========================== */}

      <div className="heyat-clubs-table-container">

        <div className="heyat-clubs-table-header columns-6">

          <div>
            نام باشگاه
          </div>

          <div>
            مدیر
          </div>

          <div>
            موبایل باشگاه
          </div>

          <div>
            موبایل مدیر
          </div>

          <div>
            تعداد شاگرد
          </div>

          <div>
            تعداد مربی
          </div>

        </div>


        {loading ? (
          <p className="loading-text">
            در حال دریافت لیست باشگاه‌ها...
          </p>

        ) : clubs.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              padding: "20px",
            }}
          >
            باشگاهی مطابق جستجوی انجام‌شده یافت نشد.
          </p>

        ) : (
          <PaginatedList
            items={clubs}
            itemsPerPage={10}
            renderItem={(
              club,
              index
            ) => (
              <div
                key={
                  club.id ||
                  index
                }
                className={
                  `heyat-clubs-table-row columns-6 ${
                    index % 2 === 0
                      ? "row-light"
                      : "row-dark"
                  }`
                }
              >

                <div
                  data-label="نام باشگاه"
                >
                  {club.club_name ||
                    "-"}
                </div>


                <div
                  data-label="مدیر"
                >
                  {club.manager_name ||
                    "-"}
                </div>


                <div
                  data-label="موبایل باشگاه"
                >
                  {club.phone ||
                    "-"}
                </div>


                <div
                  data-label="موبایل مدیر"
                >
                  {club.manager_phone ||
                    "-"}
                </div>


                <div
                  data-label="تعداد شاگرد"
                >
                  {club.student_count ??
                    0}
                </div>


                <div
                  data-label="تعداد مربی"
                >
                  {club.coach_count ??
                    0}
                </div>

              </div>
            )}
          />
        )}

      </div>
    </div>
  );
};


export default HeyatClubsTable;