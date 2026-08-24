// src/components/homepage/coaches/CoachesPage.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./CoachesPage.css";


/* =========================================================
   CONFIG
========================================================= */

const API_BASE =
  "https://api.chbtkd.ir";


/* =========================================================
   HELPERS
========================================================= */

const toFa = (value) => {

  const number =
    Number(value || 0);

  return number.toLocaleString(
    "fa-IR"
  );
};


const safeText = (
  value,
  fallback = ""
) => {

  const text =
    String(
      value ?? ""
    ).trim();

  return text || fallback;
};


const normalizeSearch = (
  value
) => {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ");
};


const getCoachFullName = (
  coach
) => {

  const fullName =
    safeText(
      coach?.full_name
    );

  if (fullName) {
    return fullName;
  }


  const firstName =
    safeText(
      coach?.first_name
    );

  const lastName =
    safeText(
      coach?.last_name
    );


  return (
    `${firstName} ${lastName}`
      .trim() ||
    "نام مربی ثبت نشده"
  );
};


const getInitials = (
  coach
) => {

  const first =
    safeText(
      coach?.first_name
    );

  const last =
    safeText(
      coach?.last_name
    );


  const initials =
    `${
      first?.[0] || ""
    }${
      last?.[0] || ""
    }`;


  return initials || "م";
};


/* =========================================================
   MEDAL ROW
========================================================= */

const MedalRow = ({
  medals,
}) => {

  return (

    <div className="coaches-medal-row">

      <span
        className="coaches-medal-item"
        title="مدال طلا"
      >

        <span className="coaches-medal-icon">
          🥇
        </span>

        <strong>
          {toFa(
            medals?.gold
          )}
        </strong>

      </span>


      <span
        className="coaches-medal-item"
        title="مدال نقره"
      >

        <span className="coaches-medal-icon">
          🥈
        </span>

        <strong>
          {toFa(
            medals?.silver
          )}
        </strong>

      </span>


      <span
        className="coaches-medal-item"
        title="مدال برنز"
      >

        <span className="coaches-medal-icon">
          🥉
        </span>

        <strong>
          {toFa(
            medals?.bronze
          )}
        </strong>

      </span>

    </div>

  );
};


/* =========================================================
   COMPONENT
========================================================= */

const CoachesPage = () => {

  const navigate =
    useNavigate();


  /* =====================================================
     STATE
  ===================================================== */

  const [
    coaches,
    setCoaches,
  ] = useState([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  const [
    search,
    setSearch,
  ] = useState("");


  const [
    gender,
    setGender,
  ] = useState("all");


  /* =====================================================
     LOAD COACHES
  ===================================================== */

  useEffect(() => {

    const controller =
      new AbortController();


    const loadCoaches =
      async () => {

        try {

          setLoading(true);

          setError("");


          const response =
            await fetch(
              `${API_BASE}/api/competitions/home/coaches/`,
              {
                method:
                  "GET",

                signal:
                  controller.signal,

                headers: {
                  Accept:
                    "application/json",
                },
              }
            );


          if (!response.ok) {

            throw new Error(
              `خطا در دریافت اطلاعات مربیان (${response.status})`
            );

          }


          const data =
            await response.json();


          if (
            controller.signal
              .aborted
          ) {
            return;
          }


          setCoaches(
            Array.isArray(
              data?.coaches
            )
              ? data.coaches
              : []
          );


        } catch (err) {

          if (
            err?.name ===
            "AbortError"
          ) {
            return;
          }


          console.error(
            "COACHES_LOAD_ERROR",
            err
          );


          setError(
            err?.message ||
            "اطلاعات مربیان دریافت نشد."
          );


        } finally {

          if (
            !controller.signal
              .aborted
          ) {

            setLoading(false);

          }

        }

      };


    loadCoaches();


    return () => {

      controller.abort();

    };

  }, []);


  /* =====================================================
     FILTER
  ===================================================== */

  const filteredCoaches =
    useMemo(() => {

      const query =
        normalizeSearch(
          search
        );


      return coaches.filter(
        coach => {

          /* =============================================
             GENDER
          ============================================= */

          if (
            gender !== "all" &&
            String(
              coach?.gender ||
              ""
            )
              .trim()
              .toLowerCase() !==
              gender
          ) {

            return false;

          }


          /* =============================================
             NO SEARCH
          ============================================= */

          if (!query) {

            return true;

          }


          /* =============================================
             CLUBS
          ============================================= */

          const clubsText =
            Array.isArray(
              coach?.clubs
            )
              ? coach.clubs
                  .map(
                    club =>
                      [
                        club?.name,
                        club?.city,
                      ]
                        .filter(Boolean)
                        .join(" ")
                  )
                  .join(" ")
              : "";


          /* =============================================
             SEARCH TEXT
          ============================================= */

          const searchable =
            normalizeSearch(
              [
                coach?.full_name,
                coach?.first_name,
                coach?.last_name,
                coach?.city,
                coach?.province,
                coach?.coach_level,
                clubsText,
              ]
                .filter(Boolean)
                .join(" ")
            );


          return searchable.includes(
            query
          );

        }
      );

    }, [
      coaches,
      search,
      gender,
    ]);


  /* =====================================================
     HOME
  ===================================================== */

  const goHome = () => {

    navigate("/");

  };


  /* =====================================================
     RENDER
  ===================================================== */

  return (

    <main
      className="coaches-page"
      dir="rtl"
    >

      <div className="coaches-page-inner">


        {/* =================================================
            TOP
        ================================================= */}

        <div className="coaches-page-top">

          <button
            type="button"
            className="coaches-back-btn"
            onClick={
              goHome
            }
          >

            <span className="coaches-back-icon">
              →
            </span>

            <span>
              بازگشت به صفحه اصلی
            </span>

          </button>


          <div className="coaches-page-count">

            <span>
              تعداد مربیان
            </span>

            <strong>
              {toFa(
                coaches.length
              )}
            </strong>

          </div>

        </div>


        {/* =================================================
            SEARCH + FILTER
        ================================================= */}

        <section className="coaches-toolbar">


          {/* ===============================================
              SEARCH
          =============================================== */}

          <div className="coaches-search">

            <span
              className="coaches-search-icon"
              aria-hidden="true"
            >
              ⌕
            </span>


            <input
              type="search"
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="جستجوی نام مربی، شهر یا باشگاه..."
              aria-label="جستجوی مربیان"
            />


            {search && (

              <button
                type="button"
                className="coaches-search-clear"
                onClick={() =>
                  setSearch("")
                }
                aria-label="پاک کردن جستجو"
              >
                ×
              </button>

            )}

          </div>


          {/* ===============================================
              FILTER
          =============================================== */}

          <div className="coaches-gender-filter">

            <button
              type="button"
              className={
                gender === "all"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setGender(
                  "all"
                )
              }
            >
              همه
            </button>


            <button
              type="button"
              className={
                gender === "male"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setGender(
                  "male"
                )
              }
            >
              آقایان
            </button>


            <button
              type="button"
              className={
                gender === "female"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setGender(
                  "female"
                )
              }
            >
              بانوان
            </button>

          </div>

        </section>


        {/* =================================================
            RESULTS COUNT
        ================================================= */}

        {!loading &&
          !error && (

          <div className="coaches-result-count">

            <span>
              نتایج نمایش داده شده
            </span>

            <strong>
              {toFa(
                filteredCoaches.length
              )}
            </strong>

          </div>

        )}


        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (

          <div className="coaches-state">

            <div className="coaches-loading-spinner" />

            <span>
              در حال دریافت اطلاعات مربیان...
            </span>

          </div>

        )}


        {/* =================================================
            ERROR
        ================================================= */}

        {!loading &&
          error && (

          <div className="coaches-state coaches-state-error">

            <strong>
              خطا
            </strong>

            <span>
              {error}
            </span>

          </div>

        )}


        {/* =================================================
            EMPTY
        ================================================= */}

        {!loading &&
          !error &&
          filteredCoaches.length ===
            0 && (

          <div className="coaches-state">

            مربی مطابق جستجو یا فیلتر انتخاب‌شده پیدا نشد.

          </div>

        )}


        {/* =================================================
            COACHES GRID
        ================================================= */}

        {!loading &&
          !error &&
          filteredCoaches.length >
            0 && (

          <section className="coaches-grid">

            {filteredCoaches.map(
              coach => {

                const ownMedals =
                  coach?.own_medals ||
                  {
                    gold: 0,
                    silver: 0,
                    bronze: 0,
                    total: 0,
                  };


                const studentMedals =
                  coach
                    ?.student_medals ||
                  {
                    gold: 0,
                    silver: 0,
                    bronze: 0,
                    total: 0,
                  };


                const clubs =
                  Array.isArray(
                    coach?.clubs
                  )
                    ? coach.clubs
                    : [];


                const coachName =
                  getCoachFullName(
                    coach
                  );


                return (

                  <article
                    className="coaches-card"
                    key={
                      coach.id
                    }
                  >


                    {/* =====================================
                        COACH PROFILE
                    ===================================== */}

                    <div className="coaches-card-profile">


                      {/* ===================================
                          PHOTO
                      =================================== */}

                      <div className="coaches-card-avatar">

                        {coach
                          ?.profile_image ? (

                          <img
                            src={
                              coach.profile_image
                            }
                            alt={
                              coachName
                            }
                            loading="lazy"
                            onError={(
                              event
                            ) => {

                              event.currentTarget
                                .style
                                .display =
                                "none";

                            }}
                          />

                        ) : (

                          <span>
                            {getInitials(
                              coach
                            )}
                          </span>

                        )}

                      </div>


                      {/* ===================================
                          NAME + META
                      =================================== */}

                      <div className="coaches-card-info">

                        <h2 className="coaches-card-fullname">

                          {coachName}

                        </h2>


                        <div className="coaches-card-meta">

                          <span
                            className={
                              `coaches-card-gender ${
                                coach
                                  ?.gender ===
                                "female"
                                  ? "is-female"
                                  : "is-male"
                              }`
                            }
                          >

                            {safeText(
                              coach
                                ?.gender_display,

                              coach
                                ?.gender ===
                                "female"
                                ? "بانوان"
                                : "آقایان"
                            )}

                          </span>


                          {coach
                            ?.coach_level && (

                            <span className="coaches-card-level">

                              {
                                coach.coach_level
                              }

                            </span>

                          )}

                        </div>

                      </div>

                    </div>


                    {/* =====================================
                        CITY
                    ===================================== */}

                    <div className="coaches-location">

                      <span className="coaches-location-icon">
                        ⌖
                      </span>


                      <div className="coaches-location-content">

                        <small>
                          شهر فعالیت
                        </small>

                        <strong>

                          {safeText(
                            coach?.city,
                            "ثبت نشده"
                          )}

                        </strong>

                      </div>

                    </div>


                    {/* =====================================
                        CLUBS
                    ===================================== */}

                    <div className="coaches-clubs">

                      <div className="coaches-section-label">

                        باشگاه‌های محل فعالیت

                      </div>


                      {clubs.length >
                        0 ? (

                        <div className="coaches-club-list">

                          {clubs.map(
                            (
                              club,
                              index
                            ) => (

                              <span
                                className="coaches-club-item"
                                key={
                                  club?.id ??
                                  `${coach.id}-${index}`
                                }
                              >

                                {safeText(
                                  club?.name,
                                  "باشگاه"
                                )}


                                {club?.city &&
                                  club.city !==
                                    coach?.city && (

                                  <small>

                                    {" "}
                                    ـ
                                    {" "}

                                    {club.city}

                                  </small>

                                )}

                              </span>

                            )
                          )}

                        </div>

                      ) : (

                        <div className="coaches-no-club">

                          باشگاهی ثبت نشده است

                        </div>

                      )}

                    </div>


                    {/* =====================================
                        MAIN STATS
                    ===================================== */}

                    <div className="coaches-card-stats">


                      {/* STUDENTS */}

                      <div className="coaches-card-stat">

                        <span>
                          شاگردان
                        </span>

                        <strong>
                          {toFa(
                            coach
                              ?.students_count
                          )}
                        </strong>

                        <small>
                          نفر
                        </small>

                      </div>


                      {/* OWN MEDALS */}

                      <div className="coaches-card-stat">

                        <span>
                          مدال‌های شخصی
                        </span>

                        <strong>
                          {toFa(
                            ownMedals
                              ?.total
                          )}
                        </strong>

                        <small>
                          مدال
                        </small>

                      </div>


                      {/* STUDENT MEDALS */}

                      <div className="coaches-card-stat is-highlight">

                        <span>
                          مدال شاگردان
                        </span>

                        <strong>
                          {toFa(
                            studentMedals
                              ?.total
                          )}
                        </strong>

                        <small>
                          مدال
                        </small>

                      </div>

                    </div>


                    {/* =====================================
                        MEDALS DETAILS
                    ===================================== */}

                    <div className="coaches-medals-grid">

                      <div className="coaches-medal-box">

                        <span className="coaches-medal-title">
                          مدال‌های شخصی
                        </span>

                        <MedalRow
                          medals={
                            ownMedals
                          }
                        />

                      </div>


                      <div className="coaches-medal-box">

                        <span className="coaches-medal-title">
                          مدال‌های شاگردان
                        </span>

                        <MedalRow
                          medals={
                            studentMedals
                          }
                        />

                      </div>

                    </div>

                  </article>

                );

              }
            )}

          </section>

        )}

      </div>

    </main>

  );
};


export default CoachesPage;