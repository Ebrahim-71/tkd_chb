// src/components/Login/panel/maincontentpanel/HeyatRefereesTable.jsx

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

import "./HeyatRefereesTable.css";


const API_BASE =
  "https://api.chbtkd.ir";


const refereeFields = [
  "کیوروگی",
  "پومسه",
  "هانمادانگ",
];


const HeyatRefereesTable = () => {
  const [
    referees,
    setReferees,
  ] = useState([]);


  const [
    filters,
    setFilters,
  ] = useState({
    belt: "همه",
    nationalLevel: "همه",
    internationalLevel: "همه",
    refereeField: "همه",
    birthFrom: "",
    birthTo: "",
    search: "",
  });


  const [
    dropdownList,
    setDropdownList,
  ] = useState({
    belts: [],
    nationalDegrees: [],
    internationalDegrees: [],
  });


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    optionsLoading,
    setOptionsLoading,
  ] = useState(true);


  const token =
    localStorage.getItem(
      "heyat_token"
    );


  // =====================================
  // مدیریت نشست منقضی‌شده
  // =====================================

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


  // =====================================
  // مدیریت خطای API
  // =====================================

  const handleApiError =
    useCallback(
      (err, title) => {
        if (
          axios.isCancel(err) ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "CanceledError"
        ) {
          return;
        }


        console.error(
          title,
          err
        );


        if (
          err?.response?.status === 401
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


  // =====================================
  // دریافت گزینه‌های فیلتر
  // =====================================

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
          /*
           * در نسخه فعلی مقادیر کمربند و درجات
           * ثابت هستند، اما درخواست form-data
           * را نگه می‌داریم تا رفتار قبلی سیستم
           * و اعتبار دسترسی تغییر نکند.
           */
          await axios.get(
            `${API_BASE}/api/auth/heyat/form-data/`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },

              signal:
                controller.signal,

              /*
               * خطا در همین فایل
               * مدیریت می‌شود.
               */
              skipGlobalError: true,
            }
          );


          if (
            controller.signal.aborted
          ) {
            return;
          }


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
            "درجه یک",
            "درجه دو",
            "درجه سه",
            "ممتاز",
          ];


          setDropdownList({
            belts: [
              {
                label: "کمربندها",
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
                label: "درجات ملی",
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
            "خطا در دریافت گزینه‌های فیلتر داوران"
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


  // =====================================
  // دریافت لیست داوران
  // =====================================

  useEffect(() => {
    if (!token) {
      return undefined;
    }


    const controller =
      new AbortController();


    const fetchReferees =
      async () => {
        try {
          setLoading(true);


          const params = {};


          // -----------------------------
          // کمربند
          // -----------------------------

          if (
            filters.belt !==
            "همه"
          ) {
            params.belt =
              filters.belt;
          }


          // -----------------------------
          // درجه ملی
          // -----------------------------

          if (
            filters.nationalLevel !==
            "همه"
          ) {
            params.national_level =
              filters.nationalLevel;
          }


          // -----------------------------
          // درجه بین‌المللی
          // -----------------------------

          if (
            filters.internationalLevel !==
            "همه"
          ) {
            params.international_level =
              filters.internationalLevel;
          }


          // -----------------------------
          // رشته داوری
          // -----------------------------

          if (
            filters.refereeField !==
            "همه"
          ) {
            params.referee_field =
              filters.refereeField;
          }


          // -----------------------------
          // تاریخ تولد
          // -----------------------------

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


          // -----------------------------
          // Search
          // -----------------------------

          if (
            filters.search?.trim()
          ) {
            params.search =
              filters.search.trim();
          }


          const res =
            await axios.get(
              `${API_BASE}/api/auth/heyat/referees/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                params,

                signal:
                  controller.signal,

                /*
                 * جلوگیری از نمایش
                 * دو Modal برای یک خطا
                 */
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


          /*
           * پشتیبانی از:
           *
           * [...]
           *
           * و:
           *
           * { results: [...] }
           */

          if (
            Array.isArray(
              responseData
            )
          ) {
            setReferees(
              responseData
            );

            return;
          }


          if (
            Array.isArray(
              responseData?.results
            )
          ) {
            setReferees(
              responseData.results
            );

            return;
          }


          setReferees([]);

        } catch (err) {
          handleApiError(
            err,
            "خطا در دریافت لیست داوران هیئت"
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    /*
     * Debounce برای فیلترها
     * مخصوصاً Search
     */
    const debounce =
      setTimeout(
        fetchReferees,
        400
      );


    return () => {
      clearTimeout(
        debounce
      );

      controller.abort();
    };

  }, [
    filters,
    token,
    handleApiError,
  ]);


  // =====================================
  // Render
  // =====================================

  return (
    <div className="heyat-referees-wrapper">

      <h2>
        لیست داوران هیئت
      </h2>


      {/* ==========================
          فیلترها
      ========================== */}

      <div className="heyat-referees-filters">

        {/* کمربند */}

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


        {/* درجه ملی */}

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


        {/* درجه بین‌المللی */}

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


        {/* رشته داوری */}

        <select
          value={
            filters.refereeField
          }
          onChange={(e) =>
            setFilters(
              (prev) => ({
                ...prev,

                refereeField:
                  e.target.value,
              })
            )
          }
        >
          {[
            "همه",
            ...refereeFields,
          ].map(
            (field) => (
              <option
                key={field}
                value={field}
              >
                {field}
              </option>
            )
          )}
        </select>


        {/* تاریخ تولد از */}

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


        {/* تاریخ تولد تا */}

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


        {/* Search */}

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

      <div className="heyat-referees-table-container">

        <div className="heyat-referees-table-header columns-14">

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


          {refereeFields.map(
            (field) => (
              <React.Fragment
                key={field}
              >
                <div>
                  {field}
                </div>

                <div>
                  ملی {field}
                </div>

                <div>
                  بین‌الملل {field}
                </div>
              </React.Fragment>
            )
          )}

        </div>


        {loading ? (
          <p className="loading-text">
            در حال دریافت لیست داوران...
          </p>

        ) : referees.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              padding: "20px",
            }}
          >
            داوری مطابق فیلترهای انتخاب‌شده یافت نشد.
          </p>

        ) : (
          <PaginatedList
            items={referees}
            itemsPerPage={10}
            renderItem={(
              referee,
              index
            ) => (
              <div
                key={
                  referee.national_code ||
                  referee.id ||
                  index
                }
                className={
                  `heyat-referees-table-row columns-14 ${
                    index % 2 === 0
                      ? "row-light"
                      : "row-dark"
                  }`
                }
              >

                <div
                  data-label="نام و نام خانوادگی"
                >
                  {referee.full_name ||
                    "-"}
                </div>


                <div
                  data-label="کد ملی"
                >
                  {referee.national_code ||
                    "-"}
                </div>


                <div
                  data-label="تاریخ تولد"
                >
                  {referee.birth_date ||
                    "-"}
                </div>


                <div
                  data-label="درجه کمربند"
                >
                  {referee.belt_grade ||
                    "-"}
                </div>


                {refereeFields.map(
                  (field) => {
                    const fieldData =
                      referee
                        .referee_fields
                        ?.[field];


                    return (
                      <React.Fragment
                        key={field}
                      >
                        <div
                          data-label={
                            field
                          }
                        >
                          {fieldData?.active
                            ? "✅"
                            : "❌"}
                        </div>


                        <div
                          data-label={
                            `ملی ${field}`
                          }
                        >
                          {fieldData?.national ||
                            "درجه ملی ندارد"}
                        </div>


                        <div
                          data-label={
                            `بین‌الملل ${field}`
                          }
                        >
                          {fieldData?.international ||
                            "درجه بین‌الملل ندارد"}
                        </div>

                      </React.Fragment>
                    );
                  }
                )}

              </div>
            )}
          />
        )}

      </div>
    </div>
  );
};


export default HeyatRefereesTable;