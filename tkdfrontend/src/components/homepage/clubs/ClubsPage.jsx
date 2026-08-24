import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
} from "react-router-dom";
import PaginatedList
  from "../../common/PaginatedList";

import "./ClubsPage.css";


const API_BASE =
  "https://api.chbtkd.ir";


const faNumber = (
  value
) => {

  return Number(
    value || 0
  ).toLocaleString(
    "fa-IR"
  );

};


const clean = (
  value,
  fallback = "—"
) => {

  const text =
    String(
      value ?? ""
    ).trim();

  return (
    text ||
    fallback
  );

};


const phoneHref = (
  value
) => {

  const phone =
    String(
      value || ""
    )
      .replace(
        /[^\d+]/g,
        ""
      );

  return phone
    ? `tel:${phone}`
    : undefined;

};

const ClubBuildingIcon = () => {

  return (

    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
    >

      {/* سقف */}
      <path
        d="M8 24L32 10L56 24"
      />

      {/* خط زیر سقف */}
      <path
        d="M12 25H52"
      />

      {/* ستون‌ها */}
      <path
        d="M16 28V48"
      />

      <path
        d="M26 28V48"
      />

      <path
        d="M38 28V48"
      />

      <path
        d="M48 28V48"
      />

      {/* پایه */}
      <path
        d="M10 49H54"
      />

      <path
        d="M7 55H57"
      />

      {/* نماد کوچک تکواندو */}
      <circle
        cx="32"
        cy="19"
        r="3"
      />

    </svg>

  );

};
const ClubsPage = () => {

  const navigate =
    useNavigate();

  const [
    clubs,
    setClubs,
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
    city,
    setCity,
  ] = useState("");


  /* =====================================================
     LOAD
  ===================================================== */

  useEffect(() => {

    const controller =
      new AbortController();


    const load =
      async () => {

        try {

          setLoading(
            true
          );

          setError(
            ""
          );


          const response =
            await fetch(
              `${API_BASE}/api/competitions/home/clubs/`,
              {
                signal:
                  controller.signal,
              }
            );


          if (
            !response.ok
          ) {

            throw new Error(
              "خطا در دریافت فهرست باشگاه‌ها"
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


          setClubs(
            Array.isArray(
              data?.results
            )
              ? data.results
              : Array.isArray(
                  data
                )
              ? data
              : []
          );

        } catch (
          err
        ) {

          if (
            err?.name !==
            "AbortError"
          ) {

            console.error(
              "CLUBS_PAGE_ERROR",
              err
            );

            setError(
              "دریافت اطلاعات باشگاه‌ها با خطا مواجه شد."
            );

          }

        } finally {

          if (
            !controller.signal
              .aborted
          ) {

            setLoading(
              false
            );

          }

        }

      };


    load();


    return () => {

      controller.abort();

    };

  }, []);


  /* =====================================================
     CITIES
  ===================================================== */

  const cities =
    useMemo(
      () => {

        return [
          ...new Set(
            clubs
              .map(
                item =>
                  String(
                    item?.city ||
                    ""
                  ).trim()
              )
              .filter(
                Boolean
              )
          ),
        ].sort(
          (
            a,
            b
          ) =>
            a.localeCompare(
              b,
              "fa"
            )
        );

      },
      [
        clubs,
      ]
    );


  /* =====================================================
     FILTER
  ===================================================== */

  const filtered =
    useMemo(
      () => {

        const q =
          search
            .trim()
            .toLowerCase();


        return clubs.filter(
          club => {

            if (
              city &&
              club?.city !==
                city
            ) {
              return false;
            }


            if (!q) {
              return true;
            }


            const coaches =
              Array.isArray(
                club?.coaches
              )
                ? club.coaches
                : [];


            const values = [

              club?.club_name,

              club?.founder_name,

              club?.province,

              club?.county,

              club?.city,

              club?.address,

              club?.phone,

              club?.mobile,

              ...coaches.map(
                coach =>
                  coach?.full_name
              ),

            ];


            return values
              .filter(
                Boolean
              )
              .some(
                value =>
                  String(
                    value
                  )
                    .toLowerCase()
                    .includes(
                      q
                    )
              );

          }
        );

      },
      [
        clubs,
        search,
        city,
      ]
    );

    const sortedClubs =
        useMemo(
            () => {

            return [
                ...filtered,
            ].sort(
                (
                a,
                b
                ) => {

                const nameA =
                    String(
                    a?.club_name ||
                    ""
                    ).trim();

                const nameB =
                    String(
                    b?.club_name ||
                    ""
                    ).trim();


                return nameA.localeCompare(
                    nameB,
                    "fa",
                    {
                    sensitivity:
                        "base",
                    }
                );

                }
            );

            },
            [
            filtered,
            ]
        );
  /* =====================================================
     CARD
  ===================================================== */

  const renderClub =
    (
      club
    ) => {

      const coaches =
        Array.isArray(
          club?.coaches
        )
          ? club.coaches
          : [];


      const medals =
        club?.medals ||
        {};


      return (

        <article
          className="public-club-card"
        >

          {/* =========================
              HEADER
          ========================= */}

          <header className="public-club-card-head">

            <div className="public-club-symbol">
                <ClubBuildingIcon />
            </div>


            <div className="public-club-head-text">

              <h2>
                {clean(
                  club?.club_name
                )}
              </h2>


              <div className="public-club-location">

                <span>
                  {clean(
                    club?.city
                  )}
                </span>

                {club?.county && (
                  <>
                    <i>
                      •
                    </i>

                    <span>
                      {club.county}
                    </span>
                  </>
                )}

              </div>

            </div>


            {club?.club_type_display && (

              <span className="public-club-type">

                {
                  club
                    .club_type_display
                }

              </span>

            )}

          </header>


          {/* =========================
              ADDRESS
          ========================= */}

          <div className="public-club-address">

            <span className="public-club-label">
              آدرس باشگاه
            </span>

            <strong>
              {clean(
                club?.address,
                "آدرس ثبت نشده"
              )}
            </strong>

          </div>


          {/* =========================
              CONTACT
          ========================= */}

          <div className="public-club-contact-grid">

            <div className="public-club-contact">

              <span>
                ☎
              </span>

              <div>
                <small>
                  تلفن باشگاه
                </small>

                {club?.phone ? (

                  <a
                    href={
                      phoneHref(
                        club.phone
                      )
                    }
                    dir="ltr"
                  >
                    {club.phone}
                  </a>

                ) : (

                  <strong>
                    —
                  </strong>

                )}
              </div>

            </div>


            <div className="public-club-contact">

              <span>
                📱
              </span>

              <div>
                <small>
                  شماره موبایل
                </small>

                {club?.mobile ? (

                  <a
                    href={
                      phoneHref(
                        club.mobile
                      )
                    }
                    dir="ltr"
                  >
                    {club.mobile}
                  </a>

                ) : (

                  <strong>
                    —
                  </strong>

                )}
              </div>

            </div>

          </div>


          {/* =========================
              COACHES
          ========================= */}

          <section className="public-club-coaches">

            <div className="public-club-section-title">

              <span>
                مربیان فعال
              </span>

              <b>
                {faNumber(
                  coaches.length
                )}
              </b>

            </div>


            {coaches.length ? (

              <div className="public-club-coach-list">

                {coaches.map(
                  coach => (

                    <div
                      className="public-club-coach-chip"
                      key={
                        coach.id
                      }
                    >

                      <span className="public-club-coach-avatar">
                        🥋
                      </span>


                      <div>

                        <strong>
                          {
                            coach
                              .full_name
                          }
                        </strong>


                        {coach
                          ?.coach_level && (

                          <small>
                            {
                              coach
                                .coach_level
                            }
                          </small>

                        )}

                      </div>

                    </div>

                  )
                )}

              </div>

            ) : (

              <div className="public-club-no-coach">
                مربی فعالی برای این باشگاه ثبت نشده است.
              </div>

            )}

          </section>


          {/* =========================
              STATS
          ========================= */}

          <footer className="public-club-stats">

            <div>

                <span>
                    شاگردان
                </span>

                <strong>
                    {faNumber(
                    club?.students_count
                    )}
                </strong>

            </div>


            <div>

              <span>
                امتیاز
              </span>

              <strong>
                {faNumber(
                  club?.ranking_total
                )}
              </strong>

            </div>


            <div className="public-club-medals">

              <span>
                مدال‌ها
              </span>

              <strong>

                <i>
                  🥇
                  {" "}
                  {faNumber(
                    medals?.gold
                  )}
                </i>

                <i>
                  🥈
                  {" "}
                  {faNumber(
                    medals?.silver
                  )}
                </i>

                <i>
                  🥉
                  {" "}
                  {faNumber(
                    medals?.bronze
                  )}
                </i>

              </strong>

            </div>

          </footer>

        </article>

      );

    };


  /* =====================================================
     RENDER
  ===================================================== */

  return (

    <main
      className="public-clubs-page"
      dir="rtl"
    >
        <div className="public-clubs-topbar">

            <button
                type="button"
                className="public-clubs-back"
                onClick={() =>
                navigate("/")
                }
            >
                <span className="public-clubs-back-arrow">
                ←
                </span>

                <span>
                بازگشت به صفحه اصلی
                </span>
            </button>

        </div>
      <section className="public-clubs-hero">

        <span>
          باشگاه‌های رسمی
        </span>

        <h1>
          باشگاه‌های تکواندو استان
        </h1>

        <p>
          اطلاعات تماس، آدرس و مربیان فعال باشگاه‌های تأییدشده
        </p>

      </section>


      <section className="public-clubs-toolbar">

        <input
          type="search"
          placeholder="جستجو نام باشگاه، مربی، شهر یا آدرس..."
          value={
            search
          }
          onChange={
            event =>
              setSearch(
                event
                  .target
                  .value
              )
          }
        />


        <select
          value={
            city
          }
          onChange={
            event =>
              setCity(
                event
                  .target
                  .value
              )
          }
        >

          <option value="">
            همه شهرها
          </option>


          {cities.map(
            item => (

              <option
                value={item}
                key={item}
              >
                {item}
              </option>

            )
          )}

        </select>


        <div className="public-clubs-count">

          تعداد باشگاه‌ها:

          <strong>
            {faNumber(
              filtered.length
            )}
          </strong>

        </div>

      </section>


      {loading ? (

        <div className="public-clubs-state">
          در حال دریافت باشگاه‌ها...
        </div>

      ) : error ? (

        <div className="public-clubs-state is-error">
          {error}
        </div>

      ) : filtered.length ===
          0 ? (

        <div className="public-clubs-state">
          باشگاهی با این مشخصات پیدا نشد.
        </div>

      ) : (

        <section className="public-clubs-results">

          <PaginatedList
            items={
                sortedClubs
            }
            itemsPerPage={6}
            mobileItemsPerPage={4}
            className="public-clubs-pagination"
            renderItem={
              renderClub
            }
          />

        </section>

      )}

    </main>

  );

};


export default ClubsPage;