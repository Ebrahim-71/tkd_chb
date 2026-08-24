// src/components/homepage/main/competitions/HomeCompetitionsSection.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./HomeCompetitionsSection.css";


const API_BASE =
  "https://api.chbtkd.ir";


const HOME_API =
  `${API_BASE}/api/competitions/home/competitions/`;


/* =========================================================
   Helpers
========================================================= */

const faNumber =
  value =>
    Number(
      value || 0
    ).toLocaleString(
      "fa-IR"
    );


const mediaUrl =
  value => {

    if (!value) {
      return "";
    }

    const text =
      String(
        value
      ).trim();


    if (
      text.startsWith(
        "http://"
      )
      ||
      text.startsWith(
        "https://"
      )
    ) {
      return text;
    }


    return (
      `${API_BASE}${text}`
    );
  };


const text =
  (
    value,
    fallback = "—"
  ) => {

    const result =
      String(
        value ?? ""
      ).trim();

    return (
      result ||
      fallback
    );
  };


/* =========================================================
   ICONS
========================================================= */

const Icon = ({
  type,
}) => {

  if (
    type === "competition"
  ) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6" />
      </svg>
    );
  }


  if (
    type === "player"
  ) {
    return (
      <svg viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="7"
          r="3"
        />
        <path d="M5 21c.6-5 3-7 7-7s6.4 2 7 7" />
      </svg>
    );
  }


  if (
    type === "coach"
  ) {
    return (
      <svg viewBox="0 0 24 24">
        <circle
          cx="9"
          cy="7"
          r="3"
        />
        <path d="M3 20c.6-4.4 2.8-6 6-6" />
        <path d="M15 9l6-3M15 13l6 3M15 5v14" />
      </svg>
    );
  }


  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M8 21v-6h8v6M8 10h1M15 10h1" />
    </svg>
  );
};


/* =========================================================
   Main
========================================================= */

const HomeCompetitionsSection =
  () => {

    const navigate =
      useNavigate();


    const [
      competitions,
      setCompetitions,
    ] = useState([]);


    const [
      stats,
      setStats,
    ] = useState({
      active_competitions: 0,
      players: 0,
      coaches: 0,
      clubs: 0,
    });


    const [
      loading,
      setLoading,
    ] = useState(true);


    const [
      error,
      setError,
    ] = useState("");


    /* =====================================================
       Load
    ===================================================== */

    useEffect(() => {

      const controller =
        new AbortController();


      const load =
        async () => {

          try {

            setLoading(true);
            setError("");


            const response =
              await fetch(
                HOME_API,
                {
                  signal:
                    controller.signal,

                  headers: {
                    Accept:
                      "application/json",
                  },
                }
              );


            if (
              !response.ok
            ) {
              throw new Error(
                `HTTP ${
                  response.status
                }`
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


            setCompetitions(
              Array.isArray(
                data?.competitions
              )
                ? data.competitions
                : []
            );


            setStats({
              active_competitions:
                Number(
                  data?.stats
                    ?.active_competitions
                  || 0
                ),

              players:
                Number(
                  data?.stats
                    ?.players
                  || 0
                ),

              coaches:
                Number(
                  data?.stats
                    ?.coaches
                  || 0
                ),

              clubs:
                Number(
                  data?.stats
                    ?.clubs
                  || 0
                ),
            });


          } catch (err) {

            if (
              err?.name !==
              "AbortError"
            ) {

              console.warn(
                "HOME_COMP_ERROR",
                err
              );

              setError(
                "دریافت مسابقات با مشکل مواجه شد."
              );

            }

          } finally {

            if (
              !controller.signal
                .aborted
            ) {
              setLoading(false);
            }

          }

        };


      load();


      return () => {
        controller.abort();
      };

    }, []);


    /* =====================================================
       Stats
    ===================================================== */

    const statItems =
      useMemo(
        () => [
          {
            label:
              "مسابقات فعال",

            value:
              stats
                .active_competitions,

            type:
              "competition",
          },

          {
            label:
              "بازیکنان",

            value:
              stats.players,

            type:
              "player",
          },

          {
            label:
              "مربیان",

            value:
              stats.coaches,

            type:
              "coach",
          },

          {
            label:
              "باشگاه‌ها",

            value:
              stats.clubs,

            type:
              "club",
          },
        ],
        [
          stats,
        ]
      );


    return (

      <section
        id="active-competitions"
        className="home-competitions"
      >

        <div className="home-competitions-inner">


          {/* ===============================================
              HEADING
          =============================================== */}

          <div className="home-comp-heading">

            <div>

              <span>
                رویدادهای تکواندو
              </span>

              <h2>
                مسابقات
              </h2>

              <p>
                مسابقات پیش‌رو و آرشیو مسابقات برگزارشده
              </p>

            </div>


            <strong>
              {faNumber(
                competitions.length
              )}
              {" "}
              مسابقه
            </strong>

          </div>


          {/* ===============================================
              STATE
          =============================================== */}

          {loading && (

            <div className="home-comp-state">
              در حال دریافت مسابقات...
            </div>

          )}


          {!loading &&
            error && (

            <div className="home-comp-state is-error">
              {error}
            </div>

          )}


          {!loading &&
            !error &&
            competitions.length ===
              0 && (

            <div className="home-comp-state">
              مسابقه‌ای ثبت نشده است.
            </div>

          )}


          {/* ===============================================
              CARDS
          =============================================== */}

          {!loading &&
            competitions.length >
              0 && (

            <div className="home-comp-grid">

              {competitions.map(
                competition => {

                  const poster =
                    mediaUrl(
                      competition
                        ?.poster
                    );


                  const finished =
                    competition
                      ?.home_status ===
                    "finished";


                  return (

                    <article
                      key={
                        `${
                          competition
                            ?.kind
                        }-${
                          competition
                            ?.public_id
                        }`
                      }
                      className={
                        `home-comp-card ${
                          finished
                            ? "is-finished"
                            : ""
                        }`
                      }
                    >

                      <div className="home-comp-card-image">

                        {poster ? (

                          <img
                            src={
                              poster
                            }
                            alt={
                              competition
                                ?.title
                            }
                          />

                        ) : (

                          <div className="home-comp-card-noimage">
                            🥋
                          </div>

                        )}


                        <span
                          className={
                            `home-comp-badge status-${
                              competition
                                ?.home_status
                            }`
                          }
                        >
                          {text(
                            competition
                              ?.status_display,
                            "به‌زودی"
                          )}
                        </span>


                        <span className="home-comp-kind">
                          {text(
                            competition
                              ?.kind_display,
                            "مسابقه"
                          )}
                        </span>

                      </div>


                      <div className="home-comp-card-body">

                        <h3>
                          {text(
                            competition
                              ?.title,
                            "مسابقه تکواندو"
                          )}
                        </h3>


                        <div className="home-comp-meta">

                          <span>
                            تاریخ برگزاری
                          </span>

                          <strong>
                            {text(
                              competition
                                ?.competition_date_jalali
                            )}
                          </strong>

                        </div>


                        <div className="home-comp-meta">

                          <span>
                            محل برگزاری
                          </span>

                          <strong>
                            {text(
                              competition
                                ?.city
                            )}
                          </strong>

                        </div>


                        <div className="home-comp-card-footer">

                          <div>

                            {finished ? (

                              <strong className="finished-label">
                                برگزار شده
                              </strong>

                            ) : competition
                                ?.days_left ===
                              0 ? (

                              <strong>
                                امروز
                              </strong>

                            ) : competition
                                ?.days_left !=
                              null ? (

                              <>
                                <strong>
                                  {faNumber(
                                    competition
                                      .days_left
                                  )}
                                </strong>

                                <span>
                                  روز مانده
                                </span>
                              </>

                            ) : null}

                          </div>


                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/competitions/${
                                  competition
                                    .public_id
                                }`
                              )
                            }
                          >
                            جزئیات
                            <b>
                              ←
                            </b>
                          </button>

                        </div>

                      </div>

                    </article>

                  );

                }
              )}

            </div>

          )}

        </div>


        {/* =================================================
            STATISTICS
        ================================================= */}

        <div className="home-comp-stats">

          {statItems.map(
            item => (

              <div
                className="home-comp-stat"
                key={
                  item.label
                }
              >

                <div className="home-comp-stat-icon">
                  <Icon
                    type={
                      item.type
                    }
                  />
                </div>


                <div>

                  <strong>
                    {faNumber(
                      item.value
                    )}
                  </strong>

                  <span>
                    {item.label}
                  </span>

                </div>

              </div>

            )
          )}

        </div>

      </section>
    );
  };


export default HomeCompetitionsSection;