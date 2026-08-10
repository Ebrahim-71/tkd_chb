// src/components/Login/panel/maincontentpanel/StudentsTable.jsx

import React, {
  useCallback,
  useEffect,
  useRef,
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

import "./StudentsTable.css";


const API_BASE =
  "https://api.chbtkd.ir";


const beltGrades = [
  "همه",
  "سفید",
  "زرد",
  "سبز",
  "آبی",
  "قرمز",
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


const StudentsTable = () => {
  const [students, setStudents] =
    useState([]);

  const [
    dropdownList,
    setDropdownList,
  ] = useState({
    coaches: [],
    clubs: [],
  });

  const [filters, setFilters] =
    useState({
      coach: "همه",
      club: "همه",
      belt: "همه",
      birthFrom: "",
      birthTo: "",
      search: "",
    });


  const authErrorHandledRef =
    useRef(false);


  const role =
    localStorage.getItem(
      "user_role"
    );

  const token =
    role
      ? localStorage.getItem(
          `${role}_token`
        )
      : null;


  const isClub =
    role === "club";

  const isCoach =
    role === "coach" ||
    role === "both";

  const isHeyat =
    role === "heyat";


  // =====================================
  // تعداد ستون‌ها
  // =====================================

  // هیئت:
  // 5 ستون پایه
  // + مسابقات / مدال / رنکینگ
  // + باشگاه / مربی
  //
  // مربی یا باشگاه:
  // 5 ستون پایه
  // + مسابقات / مدال / رنکینگ
  // + باشگاه یا مربی

  const columnCount =
    isHeyat ? 10 : 9;


  // =====================================
  // مدیریت خطاهای Axios
  // =====================================

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
          if (
            authErrorHandledRef.current
          ) {
            return;
          }

          authErrorHandledRef.current =
            true;


          if (role) {
            localStorage.removeItem(
              `${role}_token`
            );
          }

          localStorage.removeItem(
            "user_role"
          );


          showGlobalWarning(
            "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",
            "پایان اعتبار ورود"
          );


          window.location.href = "/";
          return;
        }


        showGlobalError(
          err,
          {
            title,
          }
        );
      },
      [role]
    );


  // =====================================
  // دریافت گزینه‌های فیلتر
  // =====================================

  useEffect(() => {
    if (!role || !token) {
      if (
        !authErrorHandledRef.current
      ) {
        authErrorHandledRef.current =
          true;

        showGlobalWarning(
          "اطلاعات ورود شما یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
          "نیاز به ورود مجدد"
        );

        window.location.href = "/";
      }

      return undefined;
    }


    // این جدول فقط برای
    // باشگاه، مربی/both و هیئت است.
    if (
      !isClub &&
      !isCoach &&
      !isHeyat
    ) {
      showGlobalWarning(
        "دسترسی به فهرست شاگردان برای نقش کاربری فعلی تعریف نشده است.",
        "دسترسی نامعتبر"
      );

      return undefined;
    }


    const controller =
      new AbortController();


    const fetchOptions =
      async () => {
        try {
          let url = "";


          if (isClub) {
            url =
              `${API_BASE}/api/auth/club/coaches/`;
          } else if (isCoach) {
            url =
              `${API_BASE}/api/auth/coach/clubs/`;
          } else if (isHeyat) {
            url =
              `${API_BASE}/api/auth/heyat/form-data/`;
          }


          const res =
            await axios.get(
              url,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                // خودمان خطا را
                // مدیریت می‌کنیم.
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          if (isHeyat) {
            const coaches =
              Array.isArray(
                res?.data?.coaches
              )
                ? res.data.coaches
                : [];

            const clubs =
              Array.isArray(
                res?.data?.clubs
              )
                ? res.data.clubs
                : [];


            setDropdownList({
              coaches: [
                "همه",
                ...coaches
                  .map(
                    (coach) =>
                      coach?.name ||
                      coach?.full_name
                  )
                  .filter(Boolean),
              ],

              clubs: [
                "همه",
                ...clubs
                  .map(
                    (club) =>
                      club?.club_name ||
                      club?.name
                  )
                  .filter(Boolean),
              ],
            });


            return;
          }


          const sourceItems =
            Array.isArray(res?.data)
              ? res.data
              : [];


          const items =
            sourceItems
              .map((item) => {
                if (isClub) {
                  return (
                    item?.name ||
                    item?.full_name
                  );
                }

                return (
                  item?.club_name ||
                  item?.name
                );
              })
              .filter(Boolean);


          setDropdownList({
            coaches: [
              "همه",
              ...items,
            ],
            clubs: [],
          });

        } catch (err) {
          handleApiError(
            err,
            "خطا در دریافت فیلترهای شاگردان"
          );
        }
      };


    fetchOptions();


    return () => {
      controller.abort();
    };

  }, [
    role,
    token,
    isClub,
    isCoach,
    isHeyat,
    handleApiError,
  ]);


  // =====================================
  // دریافت لیست شاگردان
  // =====================================

  useEffect(() => {
    if (
      !role ||
      !token ||
      (
        !isClub &&
        !isCoach &&
        !isHeyat
      )
    ) {
      return undefined;
    }


    const controller =
      new AbortController();


    const fetchData =
      async () => {
        try {
          const params = {};


          // -----------------------------
          // فیلتر مربی / باشگاه
          // -----------------------------

          if (isHeyat) {
            if (
              filters.coach !==
              "همه"
            ) {
              params.coach =
                filters.coach;
            }

            if (
              filters.club !==
              "همه"
            ) {
              params.club =
                filters.club;
            }

          } else if (
            filters.coach !==
            "همه"
          ) {
            if (isClub) {
              params.coach =
                filters.coach;
            }

            if (isCoach) {
              params.club =
                filters.coach;
            }
          }


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
          // جستجو
          // -----------------------------

          if (
            filters.search?.trim()
          ) {
            params.search =
              filters.search.trim();
          }


          // -----------------------------
          // Endpoint
          // -----------------------------

          let url = "";


          if (isClub) {
            url =
              `${API_BASE}/api/auth/club/students/`;
          } else if (isCoach) {
            url =
              `${API_BASE}/api/auth/coach/students/`;
          } else {
            url =
              `${API_BASE}/api/auth/heyat/students/`;
          }


          const res =
            await axios.get(
              url,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                params,

                signal:
                  controller.signal,

                // جلوگیری از
                // نمایش دو Modal
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          // API ممکن است مستقیم
          // آرایه یا results برگرداند.
          const responseData =
            res?.data;


          if (
            Array.isArray(
              responseData
            )
          ) {
            setStudents(
              responseData
            );

            return;
          }


          if (
            Array.isArray(
              responseData?.results
            )
          ) {
            setStudents(
              responseData.results
            );

            return;
          }


          setStudents([]);

        } catch (err) {
          handleApiError(
            err,
            "خطا در دریافت لیست شاگردان"
          );
        }
      };


    // برای جلوگیری از ارسال
    // درخواست در هر کلید هنگام Search
    const delay =
      setTimeout(
        fetchData,
        400
      );


    return () => {
      clearTimeout(delay);
      controller.abort();
    };

  }, [
    filters,
    role,
    token,
    isClub,
    isCoach,
    isHeyat,
    handleApiError,
  ]);


  // =====================================
  // نمایش مدال‌ها
  // =====================================

  const renderMedals = (
    student
  ) => {
    const gold =
      student?.gold_medals ??
      0;

    const silver =
      student?.silver_medals ??
      0;

    const bronze =
      student?.bronze_medals ??
      0;


    return (
      <div
        className="medal-badges"
        title={
          `طلا: ${gold} | نقره: ${silver} | برنز: ${bronze}`
        }
      >
        <span>
          ط {gold}
        </span>

        <span>
          ن {silver}
        </span>

        <span>
          ب {bronze}
        </span>
      </div>
    );
  };


  // =====================================
  // Render
  // =====================================

  return (
    <div>
      <h2>
        لیست شاگردان
      </h2>


      {/* ==========================
          فیلترها
      ========================== */}

      <div className="students-filters">

        {isHeyat ? (
          <>
            <select
              value={
                filters.coach
              }
              onChange={(e) =>
                setFilters(
                  (prev) => ({
                    ...prev,
                    coach:
                      e.target
                        .value,
                  })
                )
              }
            >
              {dropdownList.coaches.map(
                (coach) => (
                  <option
                    key={coach}
                    value={coach}
                  >
                    {coach}
                  </option>
                )
              )}
            </select>


            <select
              value={
                filters.club
              }
              onChange={(e) =>
                setFilters(
                  (prev) => ({
                    ...prev,
                    club:
                      e.target
                        .value,
                  })
                )
              }
            >
              {dropdownList.clubs.map(
                (club) => (
                  <option
                    key={club}
                    value={club}
                  >
                    {club}
                  </option>
                )
              )}
            </select>
          </>
        ) : (
          <select
            value={
              filters.coach
            }
            onChange={(e) =>
              setFilters(
                (prev) => ({
                  ...prev,
                  coach:
                    e.target.value,
                })
              )
            }
          >
            {dropdownList.coaches.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>
        )}


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
        >
          {beltGrades.map(
            (belt) => (
              <option
                key={belt}
                value={belt}
              >
                {belt}
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

      <div className="students-table-container">

        <div
          className={
            `students-table-header columns-${columnCount}`
          }
        >
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
            تاریخ اخذ کمربند
          </div>


          <div>
            مسابقات
          </div>

          <div>
            مدال‌ها
          </div>

          <div>
            رنکینگ
          </div>


          {isHeyat ? (
            <>
              <div>
                باشگاه
              </div>

              <div>
                مربی
              </div>
            </>
          ) : (
            <div>
              {isClub
                ? "مربی"
                : "باشگاه"}
            </div>
          )}
        </div>


        <PaginatedList
          items={students}
          itemsPerPage={10}
          renderItem={(
            student,
            index
          ) => (
            <div
              key={
                student.national_code ||
                student.id ||
                index
              }
              className={
                `students-table-row columns-${columnCount} ${
                  index % 2 === 0
                    ? "row-light"
                    : "row-dark"
                }`
              }
            >
              <div
                data-label="نام و نام خانوادگی"
              >
                {student.full_name ||
                  "-"}
              </div>


              <div
                data-label="کد ملی"
              >
                {student.national_code ||
                  "-"}
              </div>


              <div
                data-label="تاریخ تولد"
              >
                {student.birth_date ||
                  "-"}
              </div>


              <div
                data-label="درجه کمربند"
              >
                {student.belt_grade ||
                  "-"}
              </div>


              <div
                data-label="تاریخ اخذ کمربند"
              >
                {student.belt_certificate_date ||
                  "-"}
              </div>


              <div
                data-label="مسابقات"
              >
                {student.competitions_count ??
                  0}
              </div>


              <div
                data-label="مدال‌ها"
              >
                {renderMedals(
                  student
                )}
              </div>


              <div
                data-label="رنکینگ"
              >
                {student.ranking_total ??
                  student.ranking_competition ??
                  0}
              </div>


              {isHeyat ? (
                <>
                  <div
                    data-label="باشگاه"
                  >
                    {student.club ||
                      "-"}
                  </div>

                  <div
                    data-label="مربی"
                  >
                    {student.coach_name ||
                      "-"}
                  </div>
                </>
              ) : (
                <div
                  data-label={
                    isClub
                      ? "مربی"
                      : "باشگاه"
                  }
                >
                  {isClub
                    ? (
                        student.coach_name ||
                        "-"
                      )
                    : (
                        student.club ||
                        "-"
                      )}
                </div>
              )}

            </div>
          )}
        />
      </div>
    </div>
  );
};


export default StudentsTable;