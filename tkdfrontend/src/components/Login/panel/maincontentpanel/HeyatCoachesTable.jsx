// src/components/Login/panel/maincontentpanel/HeyatCoachesTable.jsx

import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import axios from "axios";

import PaginatedList from "../../../common/PaginatedList";

import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

import {
  showGlobalError,
  showGlobalWarning,
} from "../../../../services/globalMessage";

import "./HeyatCoachesTable.css";


const API_BASE =
  "https://api.chbtkd.ir";


const HeyatCoachesTable = () => {
  const [coaches, setCoaches] =
    useState([]);

  const [
    dropdownList,
    setDropdownList,
  ] = useState({
    clubs: [],
    belts: [],
    nationalDegrees: [],
    internationalDegrees: [],
  });

  const [filters, setFilters] =
    useState({
      club: "همه",
      belt: "همه",
      nationalLevel: "همه",
      internationalLevel: "همه",
      birthFrom: "",
      birthTo: "",
      search: "",
    });

  const [loading, setLoading] =
    useState(false);

  const [
    optionsLoading,
    setOptionsLoading,
  ] = useState(true);


  const token =
    localStorage.getItem(
      "heyat_token"
    );


  // ==============================
  // مدیریت خروج کاربر
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


      window.location.href = "/";
    }, []);


  // ==============================
  // مدیریت خطاهای API
  // ==============================

  const handleApiError =
    useCallback(
      (err, title) => {
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
          title,
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
            title,
          }
        );
      },
      [handleUnauthorized]
    );


  // ==============================
  // دریافت گزینه‌های فیلتر
  // ==============================

  useEffect(() => {
    if (!token) {
      showGlobalWarning(
        "اطلاعات ورود هیئت یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
        "نیاز به ورود مجدد"
      );

      window.location.href = "/";
      return undefined;
    }


    const controller =
      new AbortController();


    const fetchDropdownOptions =
      async () => {
        try {
          const res =
            await axios.get(
              `${API_BASE}/api/auth/heyat/form-data/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                // جلوگیری از نمایش
                // دوباره خطا توسط
                // Axios interceptor
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          const clubsData =
            Array.isArray(
              res?.data?.clubs
            )
              ? res.data.clubs
              : [];


          const clubs =
            clubsData.map(
              (club) => ({
                label:
                  club?.club_name ||
                  club?.name ||
                  "-",

                value:
                  club?.club_name ||
                  club?.name ||
                  "",
              })
            );


          const beltGrades = [
            "مشکی دان 1",
            "مشکی دان 2",
            "مشکی دان 3",
            "مشکی دان 4",
            "مشکی دان 5",
            "مشکی دان 6",
            "مشکی دان 7",
            "مشکی دان 8",
            "مشکی دان 9",
            "مشکی دان 10",
          ];


          const degrees = [
            "درجه بین‌الملل ندارد",
            "درجه یک",
            "درجه دو",
            "درجه سه",
            "ممتاز",
          ];


          setDropdownList({
            clubs: [
              {
                label:
                  "باشگاه‌ها",
                value: "همه",
              },
              ...clubs,
            ],

            belts: [
              {
                label:
                  "کمربندها",
                value: "همه",
              },

              ...beltGrades.map(
                (belt) => ({
                  label: belt,
                  value: belt,
                })
              ),
            ],

            nationalDegrees: [
              {
                label:
                  "درجات ملی",
                value: "همه",
              },

              ...degrees.map(
                (degree) => ({
                  label: degree,
                  value: degree,
                })
              ),
            ],

            internationalDegrees: [
              {
                label:
                  "درجات بین‌المللی",
                value: "همه",
              },

              ...degrees.map(
                (degree) => ({
                  label: degree,
                  value: degree,
                })
              ),
            ],
          });

        } catch (err) {
          handleApiError(
            err,
            "خطا در دریافت گزینه‌های فیلتر مربیان"
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setOptionsLoading(false);
          }
        }
      };


    fetchDropdownOptions();


    return () => {
      controller.abort();
    };

  }, [
    token,
    handleApiError,
  ]);


  // ==============================
  // دریافت لیست مربیان
  // ==============================

  useEffect(() => {
    if (!token) {
      return undefined;
    }


    const controller =
      new AbortController();


    const fetchCoaches =
      async () => {
        try {
          setLoading(true);


          const params = {};


          if (
            filters.club !==
            "همه"
          ) {
            params.club =
              filters.club;
          }


          if (
            filters.belt !==
            "همه"
          ) {
            params.belt =
              filters.belt;
          }


          if (
            filters.nationalLevel !==
            "همه"
          ) {
            params.national_level =
              filters.nationalLevel;
          }


          if (
            filters.internationalLevel !==
            "همه"
          ) {
            params.international_level =
              filters.internationalLevel;
          }


          if (
            filters.birthFrom
          ) {
            params.birth_from =
              filters.birthFrom;
          }


          if (
            filters.birthTo
          ) {
            params.birth_to =
              filters.birthTo;
          }


          if (
            filters.search?.trim()
          ) {
            params.search =
              filters.search.trim();
          }


          const res =
            await axios.get(
              `${API_BASE}/api/auth/heyat/coaches/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                params,

                signal:
                  controller.signal,

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


          if (
            Array.isArray(
              responseData
            )
          ) {
            setCoaches(
              responseData
            );

            return;
          }


          if (
            Array.isArray(
              responseData?.results
            )
          ) {
            setCoaches(
              responseData.results
            );

            return;
          }


          setCoaches([]);

        } catch (err) {
          handleApiError(
            err,
            "خطا در دریافت لیست مربیان هیئت"
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    // Debounce فیلترها و Search
    const delayDebounce =
      setTimeout(
        fetchCoaches,
        400
      );


    return () => {
      clearTimeout(
        delayDebounce
      );

      controller.abort();
    };

  }, [
    filters,
    token,
    handleApiError,
  ]);


  // ==============================
  // Render
  // ==============================

  return (
    <div className="heyat-coaches-wrapper">

      <h2>
        لیست مربی‌های هیئت
      </h2>


      {/* ==========================
          فیلترها
      ========================== */}

      <div className="heyat-coaches-filters">

        <select
          value={
            filters.club
          }
          onChange={(e) =>
            setFilters(
              (prev) => ({
                ...prev,
                club:
                  e.target.value,
              })
            )
          }
          disabled={
            optionsLoading
          }
        >
          {dropdownList.clubs.map(
            (club) => (
              <option
                key={
                  club.value
                }
                value={
                  club.value
                }
              >
                {club.label}
              </option>
            )
          )}
        </select>


        <select
          value={
            filters.belt
          }
          onChange={(e) =>
            setFilters(
              (prev) => ({
                ...prev,
                belt:
                  e.target.value,
              })
            )
          }
          disabled={
            optionsLoading
          }
        >
          {dropdownList.belts.map(
            (belt) => (
              <option
                key={
                  belt.value
                }
                value={
                  belt.value
                }
              >
                {belt.label}
              </option>
            )
          )}
        </select>


        <select
          value={
            filters.nationalLevel
          }
          onChange={(e) =>
            setFilters(
              (prev) => ({
                ...prev,
                nationalLevel:
                  e.target.value,
              })
            )
          }
          disabled={
            optionsLoading
          }
        >
          {dropdownList.nationalDegrees.map(
            (degree) => (
              <option
                key={
                  degree.value
                }
                value={
                  degree.value
                }
              >
                {degree.label}
              </option>
            )
          )}
        </select>


        <select
          value={
            filters.internationalLevel
          }
          onChange={(e) =>
            setFilters(
              (prev) => ({
                ...prev,
                internationalLevel:
                  e.target.value,
              })
            )
          }
          disabled={
            optionsLoading
          }
        >
          {dropdownList.internationalDegrees.map(
            (degree) => (
              <option
                key={
                  degree.value
                }
                value={
                  degree.value
                }
              >
                {degree.label}
              </option>
            )
          )}
        </select>


        <DatePicker
          calendar={persian}
          locale={persian_fa}
          value={
            filters.birthFrom
          }
          onChange={(date) =>
            setFilters(
              (prev) => ({
                ...prev,

                birthFrom:
                  date
                    ? date.format(
                        "YYYY/MM/DD"
                      )
                    : "",
              })
            )
          }
          inputClass="date-input"
          placeholder="تاریخ تولد از"
        />


        <DatePicker
          calendar={persian}
          locale={persian_fa}
          value={
            filters.birthTo
          }
          onChange={(date) =>
            setFilters(
              (prev) => ({
                ...prev,

                birthTo:
                  date
                    ? date.format(
                        "YYYY/MM/DD"
                      )
                    : "",
              })
            )
          }
          inputClass="date-input"
          placeholder="تاریخ تولد تا"
        />


        <input
          type="text"
          className="search-input"
          placeholder="جستجو بر اساس نام یا کد ملی"
          value={
            filters.search
          }
          onChange={(e) =>
            setFilters(
              (prev) => ({
                ...prev,

                search:
                  e.target.value,
              })
            )
          }
        />
      </div>


      {/* ==========================
          جدول
      ========================== */}

      <div className="heyat-coaches-table-container">

        <div className="heyat-coaches-table-header">
          <div>
            نام و نام خانوادگی
          </div>

          <div>
            کد ملی
          </div>

          <div>
            تاریخ تولد
          </div>

          <div>
            درجه کمربند
          </div>

          <div>
            درجه ملی
          </div>

          <div>
            درجه بین‌المللی
          </div>

          <div>
            باشگاه‌ها
          </div>
        </div>


        {loading ? (
          <p className="loading-text">
            در حال دریافت لیست مربیان...
          </p>
        ) : coaches.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              padding: "20px",
            }}
          >
            مربی‌ای مطابق فیلترهای انتخاب‌شده یافت نشد.
          </p>
        ) : (
          <PaginatedList
            items={coaches}
            itemsPerPage={10}
            renderItem={(
              coach,
              index
            ) => (
              <div
                key={
                  coach.national_code ||
                  coach.id ||
                  index
                }
                className={
                  `heyat-coaches-table-row ${
                    index % 2 === 0
                      ? "row-light"
                      : "row-dark"
                  }`
                }
              >
                <div
                  data-label="نام و نام خانوادگی"
                >
                  {coach.full_name ||
                    "-"}
                </div>


                <div
                  data-label="کد ملی"
                >
                  {coach.national_code ||
                    "-"}
                </div>


                <div
                  data-label="تاریخ تولد"
                >
                  {coach.birth_date ||
                    "-"}
                </div>


                <div
                  data-label="درجه کمربند"
                >
                  {coach.belt_grade ||
                    "-"}
                </div>


                <div
                  data-label="درجه ملی"
                >
                  {coach.national_certificate_date ||
                    "درجه ملی ندارد"}
                </div>


                <div
                  data-label="درجه بین‌المللی"
                >
                  {coach.international_certificate_date ||
                    "درجه بین‌الملل ندارد"}
                </div>


                <div
                  data-label="باشگاه‌ها"
                >
                  {Array.isArray(
                    coach.clubs
                  ) &&
                  coach.clubs.length
                    ? coach.clubs.join(
                        " - "
                      )
                    : "-"}
                </div>
              </div>
            )}
          />
        )}

      </div>
    </div>
  );
};


export default HeyatCoachesTable;