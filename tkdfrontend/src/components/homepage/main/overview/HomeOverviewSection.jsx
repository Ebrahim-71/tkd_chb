// src/components/homepage/main/overview/HomeOverviewSection.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./HomeOverviewSection.css";
import PaginatedList from "../../../common/PaginatedList";

const API_BASE =
  "https://api.chbtkd.ir";


/* =========================================================
   HELPERS
========================================================= */

const asArray = (data) => {

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.results
    )
  ) {
    return data.results;
  }

  return [];
};


const mediaUrl = (value) => {

  if (!value) {
    return "";
  }

  const url =
    String(value).trim();

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  return `${API_BASE}${url}`;
};


const getImage = (item) => {

  if (!item) {
    return "";
  }

  const direct =
    item.image ||
    item.slider_image ||
    item.poster ||
    item.thumbnail ||
    item.background_image;

  if (direct) {
    return mediaUrl(direct);
  }

  if (
    Array.isArray(item.images) &&
    item.images.length
  ) {

    const first =
      item.images[0];

    return mediaUrl(
      first?.image ||
      first?.url
    );
  }

  return "";
};


const cleanText = (
  value,
  fallback = ""
) => {

  const text =
    String(value || "")
      .replace(/<[^>]*>/g, "")
      .trim();

  return text || fallback;
};


const faNumber = (value) => {

  return Number(
    value || 0
  ).toLocaleString(
    "fa-IR"
  );
};


/* =========================================================
   ICONS
========================================================= */

const StatIcon = ({
  type,
}) => {

  if (
    type === "competition"
  ) {

    return (

      <svg viewBox="0 0 24 24">

        <path
          d="M8 4h8v4a4 4 0 0 1-8 0V4Z"
        />

        <path
          d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6"
        />

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

        <path
          d="M5 21c.6-5 3-7 7-7s6.4 2 7 7"
        />

      </svg>

    );
  }


  if (
    type === "coach"
  ) {

    return (

      <svg viewBox="0 0 24 24">

        <circle
          cx="8"
          cy="7"
          r="3"
        />

        <path
          d="M2 21c.4-5 2.8-7 6-7"
        />

        <path
          d="M14 5v14M14 8l7-3M14 12l7 3"
        />

      </svg>

    );
  }


  return (

    <svg viewBox="0 0 24 24">

      <path
        d="M4 21V8l8-5 8 5v13"
      />

      <path
        d="M8 21v-6h8v6M8 10h1M15 10h1"
      />

    </svg>

  );
};


/* =========================================================
   COMPONENT
========================================================= */

const HomeOverviewSection = () => {

  const navigate =
    useNavigate();


  /* =====================================================
     DATA
  ===================================================== */

  const [
    gallery,
    setGallery,
  ] = useState([]);


  const [
    galleryIndex,
    setGalleryIndex,
  ] = useState(0);


  const [
    news,
    setNews,
  ] = useState([]);


  const [
    circulars,
    setCirculars,
  ] = useState([]);


  const [
    competitions,
    setCompetitions,
  ] = useState([]);




  const [
    cardsPerPage,
    setCardsPerPage,
  ] = useState(3);


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


  /* =====================================================
     RESPONSIVE COMPETITION COUNT
  ===================================================== */

  useEffect(() => {

    const handleResize =
      () => {

        if (
          window.innerWidth <=
          680
        ) {

          setCardsPerPage(1);

        } else if (
          window.innerWidth <=
          1100
        ) {

          setCardsPerPage(2);

        } else {

          setCardsPerPage(3);

        }

      };


    handleResize();


    window.addEventListener(
      "resize",
      handleResize
    );


    return () => {

      window.removeEventListener(
        "resize",
        handleResize
      );

    };

  }, []);


  /* =====================================================
     LOAD ALL DATA
  ===================================================== */

  useEffect(() => {

    const controller =
      new AbortController();


    const loadData =
      async () => {

        try {

          setLoading(true);


          const [
            sliderRes,
            newsRes,
            circularRes,
            competitionRes,
          ] =
            await Promise.all([

              fetch(
                `${API_BASE}/api/slider-images/`,
                {
                  signal:
                    controller.signal,
                }
              ),

              fetch(
                `${API_BASE}/api/news/slider/`,
                {
                  signal:
                    controller.signal,
                }
              ),

              fetch(
                `${API_BASE}/api/circulars/slider/`,
                {
                  signal:
                    controller.signal,
                }
              ),

              fetch(
                `${API_BASE}/api/competitions/home/competitions/`,
                {
                  signal:
                    controller.signal,
                }
              ),

            ]);


          const [
            sliderData,
            newsData,
            circularData,
            competitionData,
          ] =
            await Promise.all([

              sliderRes.ok
                ? sliderRes.json()
                : [],

              newsRes.ok
                ? newsRes.json()
                : [],

              circularRes.ok
                ? circularRes.json()
                : [],

              competitionRes.ok
                ? competitionRes.json()
                : {},

            ]);


          if (
            controller.signal.aborted
          ) {
            return;
          }


          setGallery(
            asArray(
              sliderData
            )
          );


          setNews(
            asArray(
              newsData
            )
          );


          setCirculars(
            asArray(
              circularData
            )
          );


          setCompetitions(
            Array.isArray(
              competitionData
                ?.competitions
            )
              ? competitionData
                  .competitions
              : []
          );


          setStats({

            active_competitions:
              Number(
                competitionData
                  ?.stats
                  ?.active_competitions
                || 0
              ),

            players:
              Number(
                competitionData
                  ?.stats
                  ?.players
                || 0
              ),

            coaches:
              Number(
                competitionData
                  ?.stats
                  ?.coaches
                || 0
              ),

            clubs:
              Number(
                competitionData
                  ?.stats
                  ?.clubs
                || 0
              ),

          });


        } catch (error) {

          if (
            error?.name !==
            "AbortError"
          ) {

            console.warn(
              "HOME_OVERVIEW_ERROR",
              error
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


    loadData();


    return () => {

      controller.abort();

    };

  }, []);


  /* =====================================================
     GALLERY
  ===================================================== */

  const gallerySlides =
    useMemo(
      () => {

        return gallery
          .map(
            (
              item,
              index
            ) => ({

              id:
                item?.id ??
                index,

              image:
                getImage(item),

              title:
                cleanText(
                  item?.title
                ),

            })
          )
          .filter(
            item =>
              item.image
          );

      },
      [
        gallery,
      ]
    );


  /* =====================================================
     AUTO IMAGE SLIDER
  ===================================================== */

  useEffect(() => {

    if (
      gallerySlides.length <=
      1
    ) {

      return undefined;

    }


    const timer =
      setInterval(
        () => {

          setGalleryIndex(
            current =>
              (
                current + 1
              ) %
              gallerySlides.length
          );

        },
        5000
      );


    return () => {

      clearInterval(
        timer
      );

    };

  }, [
    gallerySlides.length,
  ]);


  /* =====================================================
     NEWS + CIRCULAR
  ===================================================== */

  const informationItems =
    useMemo(
      () => {

        const newsItems =
          news.map(
            item => ({
              ...item,

              itemType:
                "news",
            })
          );


        const circularItems =
          circulars.map(
            item => ({
              ...item,

              itemType:
                "circular",
            })
          );


        const result = [];


        const max =
          Math.max(
            newsItems.length,
            circularItems.length
          );


        for (
          let i = 0;
          i < max;
          i += 1
        ) {

          if (
            newsItems[i]
          ) {

            result.push(
              newsItems[i]
            );

          }


          if (
            circularItems[i]
          ) {

            result.push(
              circularItems[i]
            );

          }

        }


        return result.slice(
          0,
          5
        );

      },
      [
        news,
        circulars,
      ]
    );



  /* =====================================================
     STATS
  ===================================================== */

  const statItems = [

    {
      type:
        "competition",

      label:
        "مسابقات فعال",

      value:
        stats
          .active_competitions,

      featured:
        true,
    },


    {
      type:
        "player",

      label:
        "بازیکنان",

      value:
        stats.players,
    },


    {
      type:
        "coach",

      label:
        "مربیان",

      value:
        stats.coaches,

      path:
        "/coaches",
    },


    {
      type:
        "club",

      label:
        "باشگاه‌ها",

      value:
        stats.clubs,

      path:
        "/clubs",
    },

  ];


  /* =====================================================
     STAT CLICK
  ===================================================== */

  const handleStatClick =
    (item) => {

      if (
        !item?.path
      ) {
        return;
      }


      navigate(
        item.path
      );

    };


  const handleStatKeyDown =
    (
      event,
      item
    ) => {

      if (
        !item?.path
      ) {
        return;
      }


      if (
        event.key ===
          "Enter"
        ||
        event.key ===
          " "
      ) {

        event.preventDefault();


        navigate(
          item.path
        );

      }

    };


  return (

    <section
      id="home-news"
      className="home-overview"
    >

      <div className="home-overview-inner">


        {/* =================================================
            TOP GRID
        ================================================= */}

        <div className="home-overview-grid">


          {/* =================================================
              RIGHT - IMAGE SLIDER
          ================================================= */}

          <div className="home-overview-gallery">

            <div className="home-overview-title">

              <span>
                گالری
              </span>

              <strong>
                تصاویر هیئت
              </strong>

            </div>


            <div className="home-overview-gallery-box">


              {loading &&
                gallerySlides.length ===
                  0 && (

                <div className="home-overview-empty">
                  در حال دریافت...
                </div>

              )}


              {!loading &&
                gallerySlides.length ===
                  0 && (

                <div className="home-overview-empty">
                  تصویری ثبت نشده است
                </div>

              )}


              {gallerySlides.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={
                      item.id
                    }
                    className={
                      `home-overview-gallery-slide ${
                        index ===
                        galleryIndex
                          ? "is-active"
                          : ""
                      }`
                    }
                  >

                    <img
                      src={
                        item.image
                      }
                      alt={
                        item.title ||
                        "گالری تکواندو"
                      }
                    />

                  </div>

                )
              )}


              {gallerySlides.length >
                1 && (

                <>

                  <button
                    type="button"
                    className="home-overview-gallery-arrow is-right"
                    onClick={() =>
                      setGalleryIndex(
                        current =>
                          (
                            current +
                            1
                          ) %
                          gallerySlides.length
                      )
                    }
                    aria-label="تصویر بعدی"
                  >
                    ‹
                  </button>


                  <button
                    type="button"
                    className="home-overview-gallery-arrow is-left"
                    onClick={() =>
                      setGalleryIndex(
                        current =>
                          (
                            current -
                            1 +
                            gallerySlides.length
                          ) %
                          gallerySlides.length
                      )
                    }
                    aria-label="تصویر قبلی"
                  >
                    ›
                  </button>


                  <div className="home-overview-gallery-dots">

                    {gallerySlides.map(
                      (
                        _,
                        index
                      ) => (

                        <button
                          type="button"
                          key={
                            index
                          }
                          className={
                            index ===
                            galleryIndex
                              ? "is-active"
                              : ""
                          }
                          onClick={() =>
                            setGalleryIndex(
                              index
                            )
                          }
                          aria-label={
                            `تصویر ${
                              index + 1
                            }`
                          }
                        />

                      )
                    )}

                  </div>

                </>

              )}

            </div>

          </div>


          {/* =================================================
              CENTER - NEWS + CIRCULAR
          ================================================= */}

          <div className="home-overview-information">

            <div className="home-overview-title">

              <span>
                تازه‌ترین
              </span>

              <strong>
                اخبار و اطلاعیه‌ها
              </strong>

            </div>


            <div className="home-information-list">

              {informationItems.map(
                (
                  item,
                  index
                ) => {

                  const image =
                    getImage(
                      item
                    );


                  const isCircular =
                    item.itemType ===
                    "circular";


                  return (

                    <button
                      type="button"
                      key={
                        `${
                          item.itemType
                        }-${
                          item.id ??
                          index
                        }`
                      }
                      className="home-information-item"
                      onClick={() => {

                        if (
                          isCircular
                        ) {

                          navigate(
                            `/circular/${item.id}`
                          );

                        } else {

                          navigate(
                            `/news/${item.id}`
                          );

                        }

                      }}
                    >

                      <div className="home-information-thumb">

                        {image ? (

                          <img
                            src={
                              image
                            }
                            alt=""
                          />

                        ) : (

                          <span>
                            🥋
                          </span>

                        )}

                      </div>


                      <div className="home-information-text">

                        <span
                          className={
                            isCircular
                              ? "is-circular"
                              : "is-news"
                          }
                        >

                          {isCircular
                            ? "اطلاعیه"
                            : "خبر"}

                        </span>


                        <strong>

                          {cleanText(
                            item.title,

                            isCircular
                              ? "اطلاعیه هیئت تکواندو"
                              : "خبر تکواندو"
                          )}

                        </strong>

                      </div>


                      <b>
                        ←
                      </b>

                    </button>

                  );

                }
              )}


              {!loading &&
                informationItems.length ===
                  0 && (

                <div className="home-overview-empty small">
                  خبر یا اطلاعیه‌ای ثبت نشده است
                </div>

              )}

            </div>

          </div>


          {/* =================================================
              LEFT - COMPETITIONS
          ================================================= */}

          <div
            className="home-overview-competitions"
            id="active-competitions"
          >

            <div className="home-overview-competition-head">

              <div className="home-overview-title">

                <span>
                  رویدادها
                </span>

                <strong>
                  مسابقات
                </strong>

              </div>

            </div>


            <div className="home-overview-comp-grid">

              <PaginatedList
                items={competitions}
                itemsPerPage={cardsPerPage}
                className="home-competitions-pagination"
                renderItem={(
                  competition
                ) => {

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
                      className={
                        `home-overview-comp-card ${
                          finished
                            ? "is-finished"
                            : ""
                        }`
                      }
                    >

                      <div className="home-overview-comp-image">

                        {poster ? (

                          <img
                            src={poster}
                            alt={
                              competition.title
                            }
                          />

                        ) : (

                          <div className="home-overview-comp-placeholder">
                            🥋
                          </div>

                        )}


                        <span
                          className={
                            `home-overview-comp-status status-${
                              competition
                                .home_status ||
                              "upcoming"
                            }`
                          }
                        >

                          {cleanText(
                            competition
                              .status_display,
                            "به‌زودی"
                          )}

                        </span>

                      </div>


                      <div className="home-overview-comp-body">

                        <span className="home-overview-comp-type">

                          {cleanText(
                            competition
                              .kind_display,
                            "مسابقه"
                          )}

                        </span>


                        <h3>

                          {cleanText(
                            competition.title,
                            "مسابقه تکواندو"
                          )}

                        </h3>


                        <div className="home-overview-comp-meta">

                          <span>

                            {cleanText(
                              competition
                                .competition_date_jalali
                            )}

                          </span>


                          <span>

                            {cleanText(
                              competition.city
                            )}

                          </span>

                        </div>


                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/competitions/${competition.public_id}`
                            )
                          }
                        >
                          مشاهده جزئیات
                        </button>

                      </div>

                    </article>

                  );

                }}
              />

            </div>


            {competitions.length ===
              0 &&
              !loading && (

              <div className="home-overview-empty">
                مسابقه‌ای ثبت نشده است
              </div>

            )}

          </div>

        </div>


        {/* =================================================
            STATS BAR
        ================================================= */}

        <div className="home-overview-stats">

          {statItems.map(
            item => {

              const isClickable =
                Boolean(
                  item.path
                );


              return (

                <div
                  key={
                    item.type
                  }

                  className={
                    `home-overview-stat ${
                      item.featured
                        ? "is-featured"
                        : ""
                    } ${
                      isClickable
                        ? "is-clickable"
                        : ""
                    }`
                  }

                  onClick={() =>
                    handleStatClick(
                      item
                    )
                  }

                  onKeyDown={(
                    event
                  ) =>
                    handleStatKeyDown(
                      event,
                      item
                    )
                  }

                  role={
                    isClickable
                      ? "button"
                      : undefined
                  }

                  tabIndex={
                    isClickable
                      ? 0
                      : undefined
                  }

                  title={
                    item.type === "coach"
                      ? "مشاهده فهرست مربیان"
                      : item.type === "club"
                      ? "مشاهده فهرست باشگاه‌ها"
                      : undefined
                  }
                >

                  <div className="home-overview-stat-icon">

                    <StatIcon
                      type={
                        item.type
                      }
                    />

                  </div>


                  <div className="home-overview-stat-text">

                    <span>
                      {item.label}
                    </span>


                    <strong>

                      {faNumber(
                        item.value
                      )}

                    </strong>

                  </div>


                  {(
                    item.type === "coach" ||
                    item.type === "club"
                  ) && (

                    <span className="home-stat-link-hint">
                      {item.type === "coach"
                        ? "مشاهده مربیان"
                        : "مشاهده باشگاه‌ها"}
                    </span>

                  )}

                </div>

              );

            }
          )}

        </div>

      </div>

    </section>

  );
};


export default HomeOverviewSection;