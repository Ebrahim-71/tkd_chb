// src/components/homepage/main/slider/HomeMediaSection.js

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./HomeMediaSection.css";


const API_BASE =
  "https://api.chbtkd.ir";


/* =========================================================
   Helpers
========================================================= */

const makeArray = (
  data
) => {

  if (
    Array.isArray(data)
  ) {
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


const mediaUrl = (
  value
) => {

  if (!value) {
    return "";
  }

  const url =
    String(value).trim();


  if (
    url.startsWith(
      "http://"
    )
    ||
    url.startsWith(
      "https://"
    )
  ) {
    return url;
  }


  return `${API_BASE}${url}`;
};


const getImage = (
  item
) => {

  if (!item) {
    return "";
  }


  const direct =
    item.image ||
    item.slider_image ||
    item.thumbnail ||
    item.poster ||
    item.background_image;


  if (direct) {
    return mediaUrl(
      direct
    );
  }


  if (
    Array.isArray(
      item.images
    )
    &&
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
    String(
      value || ""
    )
      .replace(
        /<[^>]*>/g,
        ""
      )
      .trim();

  return (
    text ||
    fallback
  );
};


/* =========================================================
   Main
========================================================= */

const HomeMediaSection =
  () => {

    const navigate =
      useNavigate();


    const [
      gallery,
      setGallery,
    ] = useState([]);


    const [
      activeSlide,
      setActiveSlide,
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
      loading,
      setLoading,
    ] = useState(true);


    /* =====================================================
       Load
    ===================================================== */

    useEffect(() => {

      const controller =
        new AbortController();


      const load =
        async () => {

          try {

            const [
              galleryRes,
              newsRes,
              circularRes,
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
              ]);


            const [
              galleryData,
              newsData,
              circularData,
            ] =
              await Promise.all([
                galleryRes.ok
                  ? galleryRes.json()
                  : [],

                newsRes.ok
                  ? newsRes.json()
                  : [],

                circularRes.ok
                  ? circularRes.json()
                  : [],
              ]);


            if (
              controller.signal
                .aborted
            ) {
              return;
            }


            setGallery(
              makeArray(
                galleryData
              )
            );


            setNews(
              makeArray(
                newsData
              ).slice(
                0,
                3
              )
            );


            setCirculars(
              makeArray(
                circularData
              ).slice(
                0,
                4
              )
            );


          } catch (error) {

            if (
              error?.name !==
              "AbortError"
            ) {

              console.warn(
                "HOME_MEDIA_LOAD_ERROR",
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


      load();


      return () => {
        controller.abort();
      };

    }, []);


    /* =====================================================
       Auto Slider
    ===================================================== */

    useEffect(() => {

      if (
        gallery.length <= 1
      ) {
        return undefined;
      }


      const interval =
        setInterval(
          () => {

            setActiveSlide(
              (current) =>
                (
                  current + 1
                )
                %
                gallery.length
            );

          },
          5000
        );


      return () => {
        clearInterval(
          interval
        );
      };

    }, [
      gallery.length,
    ]);


    useEffect(() => {

      if (
        activeSlide >=
        gallery.length
      ) {
        setActiveSlide(0);
      }

    }, [
      gallery.length,
      activeSlide,
    ]);


    const slides =
      useMemo(
        () =>
          gallery.map(
            (
              item,
              index
            ) => ({
              id:
                item?.id ??
                index,

              image:
                getImage(
                  item
                ),
            })
          )
          .filter(
            item =>
              item.image
          ),
        [
          gallery,
        ]
      );


    return (

      <section
        className="home-media"
        id="home-news"
      >

        {/* =================================================
            IMAGE SLIDER - FIRST
        ================================================= */}

        <div className="home-gallery-block">

          <div className="home-gallery-slider">

            {loading &&
              slides.length === 0 && (

              <div className="home-gallery-placeholder">
                در حال دریافت تصاویر...
              </div>

            )}


            {!loading &&
              slides.length === 0 && (

              <div className="home-gallery-placeholder">
                تصویری برای اسلایدر ثبت نشده است
              </div>

            )}


            {slides.map(
              (
                slide,
                index
              ) => (

                <div
                  key={
                    slide.id
                  }
                  className={
                    `home-gallery-slide ${
                      index ===
                      activeSlide
                        ? "is-active"
                        : ""
                    }`
                  }
                >

                  <img
                    src={
                      slide.image
                    }
                    alt="گالری هیئت تکواندو"
                  />

                </div>

              )
            )}


            {slides.length >
              1 && (

              <>
                <button
                  type="button"
                  className="home-gallery-arrow home-gallery-next"
                  onClick={() =>
                    setActiveSlide(
                      current =>
                        (
                          current + 1
                        )
                        %
                        slides.length
                    )
                  }
                  aria-label="تصویر بعدی"
                >
                  ‹
                </button>


                <button
                  type="button"
                  className="home-gallery-arrow home-gallery-prev"
                  onClick={() =>
                    setActiveSlide(
                      current =>
                        (
                          current -
                          1 +
                          slides.length
                        )
                        %
                        slides.length
                    )
                  }
                  aria-label="تصویر قبلی"
                >
                  ›
                </button>


                <div className="home-gallery-dots">

                  {slides.map(
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
                          activeSlide
                            ? "is-active"
                            : ""
                        }
                        onClick={() =>
                          setActiveSlide(
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
            NEWS / CIRCULAR HEADER
        ================================================= */}

        <div className="home-media-heading">

          <span>
            تازه‌ترین مطالب
          </span>

          <h2>
            اخبار و اطلاعیه‌ها
          </h2>

          <p>
            جدیدترین اخبار، بخشنامه‌ها و اطلاعیه‌های رسمی هیئت تکواندو استان
          </p>

        </div>


        {/* =================================================
            NEWS + CIRCULARS
        ================================================= */}

        <div className="home-media-info-grid">


          {/* ===============================================
              NEWS
          =============================================== */}

          <div className="home-news-area">

            <div className="home-media-subheading">

              <strong>
                آخرین اخبار
              </strong>

              <span>
                تازه‌ترین رویدادها
              </span>

            </div>


            <div className="home-news-grid">

              {news.map(
                item => {

                  const image =
                    getImage(
                      item
                    );

                  return (

                    <article
                      className="home-news-card"
                      key={
                        item?.id
                      }
                      onClick={() =>
                        navigate(
                          `/news/${item.id}`
                        )
                      }
                    >

                      <div className="home-news-image">

                        {image ? (

                          <img
                            src={
                              image
                            }
                            alt={
                              cleanText(
                                item?.title
                              )
                            }
                          />

                        ) : (

                          <div className="home-news-no-image">
                            🥋
                          </div>

                        )}

                      </div>


                      <div className="home-news-body">

                        <span>
                          خبر
                        </span>

                        <h3>
                          {cleanText(
                            item?.title,
                            "خبر تکواندو"
                          )}
                        </h3>

                        <p>
                          {cleanText(
                            item?.summary ||
                            item?.description ||
                            item?.content,
                            "مشاهده جزئیات خبر"
                          )}
                        </p>

                        <button
                          type="button"
                        >
                          مشاهده
                        </button>

                      </div>

                    </article>

                  );

                }
              )}

            </div>

          </div>


          {/* ===============================================
              CIRCULARS
          =============================================== */}

          <aside className="home-circular-area">

            <div className="home-media-subheading">

              <strong>
                اطلاعیه‌ها
              </strong>

              <span>
                بخشنامه و اطلاع‌رسانی
              </span>

            </div>


            <div className="home-circular-list">

              {circulars.map(
                item => {

                  const image =
                    getImage(
                      item
                    );

                  return (

                    <button
                      type="button"
                      key={
                        item?.id
                      }
                      className="home-circular-item"
                      onClick={() =>
                        navigate(
                          `/circular/${item.id}`
                        )
                      }
                    >

                      <div className="home-circular-thumb">

                        {image ? (

                          <img
                            src={
                              image
                            }
                            alt=""
                          />

                        ) : (

                          <span>
                            !
                          </span>

                        )}

                      </div>


                      <div>

                        <span>
                          اطلاعیه
                        </span>

                        <strong>
                          {cleanText(
                            item?.title,
                            "اطلاعیه هیئت تکواندو"
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

            </div>

          </aside>

        </div>

      </section>
    );
  };


export default HomeMediaSection;