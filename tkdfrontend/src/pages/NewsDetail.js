// src/pages/NewsDetail.js

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import AdvancedLightbox from "./AdvancedLightbox";

import {
  apiFetchSilent,
} from "../api/apiClient";

import {
  showGlobalMessage,
} from "../services/globalMessage";

import "./CircularDetail.css";


const API_BASE =
  "https://api.chbtkd.ir";


/* ======================================================
   Helpers
====================================================== */

const buildFileUrl = (
  url
) => {
  if (!url) {
    return "";
  }


  const value =
    String(url).trim();


  if (
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }


  if (
    value.startsWith("/")
  ) {
    return `${API_BASE}${value}`;
  }


  return `${API_BASE}/${value}`;
};


const getErrorMessage = (
  payload,
  fallback
) => {
  if (
    typeof payload === "string" &&
    payload.trim()
  ) {
    return payload.trim();
  }


  const direct =
    payload?.detail ||
    payload?.message ||
    payload?.error;


  if (
    typeof direct === "string" &&
    direct.trim()
  ) {
    return direct.trim();
  }


  if (
    Array.isArray(direct)
  ) {
    const text =
      direct
        .filter(Boolean)
        .map(String)
        .join("\n");


    if (text) {
      return text;
    }
  }


  return fallback;
};


/* ======================================================
   Component
====================================================== */

const NewsDetail = () => {
  const {
    id,
  } = useParams();


  const navigate =
    useNavigate();


  const [
    news,
    setNews,
  ] = useState(null);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadState,
    setLoadState,
  ] = useState("loading");
  // loading | ready | not-found | failed


  const [
    lightboxOpen,
    setLightboxOpen,
  ] = useState(false);


  const [
    selectedIndex,
    setSelectedIndex,
  ] = useState(0);


  /* ====================================================
     Load news
  ==================================================== */

  useEffect(() => {
    const controller =
      new AbortController();


    const loadNews =
      async () => {
        setLoading(true);

        setLoadState(
          "loading"
        );

        setNews(
          null
        );


        try {
          const response =
            await apiFetchSilent(
              `${API_BASE}/api/news/${encodeURIComponent(
                id
              )}/`,
              {
                method: "GET",

                headers: {
                  Accept:
                    "application/json",
                },

                signal:
                  controller.signal,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          let payload =
            null;


          try {
            payload =
              await response.json();
          } catch {
            payload =
              null;
          }


          /* ============================================
             404 = خبر وجود ندارد
          ============================================ */

          if (
            response.status === 404
          ) {
            setLoadState(
              "not-found"
            );

            return;
          }


          /* ============================================
             سایر خطاهای HTTP
          ============================================ */

          if (
            !response.ok
          ) {
            setLoadState(
              "failed"
            );


            showGlobalMessage({
              type: "error",

              title:
                "خطا در دریافت خبر",

              message:
                getErrorMessage(
                  payload,
                  `سرور با کد ${response.status} پاسخ داد.`
                ),
            });


            return;
          }


          /* ============================================
             پاسخ نامعتبر
          ============================================ */

          if (
            !payload ||
            payload?.error
          ) {
            setLoadState(
              "failed"
            );


            showGlobalMessage({
              type: "error",

              title:
                "خطا در دریافت خبر",

              message:
                getErrorMessage(
                  payload,
                  "اطلاعات خبر از سرور دریافت نشد."
                ),
            });


            return;
          }


          setNews(
            payload
          );


          setLoadState(
            "ready"
          );

        } catch (error) {
          if (
            controller.signal.aborted ||
            error?.name === "AbortError" ||
            error?.name === "CanceledError" ||
            error?.code === "ERR_CANCELED"
          ) {
            return;
          }


          console.error(
            "NEWS_DETAIL_LOAD_ERROR",
            error
          );


          setLoadState(
            "failed"
          );


          showGlobalMessage({
            type: "error",

            title:
              "خطا در دریافت خبر",

            message:
              error?.message ||
              "ارتباط با سرور برای دریافت جزئیات خبر برقرار نشد.",
          });

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(
              false
            );
          }
        }
      };


    loadNews();


    return () => {
      controller.abort();
    };

  }, [id]);


  /* ====================================================
     Extra images
  ==================================================== */

  const fullImages =
    useMemo(() => {
      const images =
        Array.isArray(
          news?.images
        )
          ? news.images
          : [];


      return images
        .map(
          (item) =>
            buildFileUrl(
              item?.image ||
              item?.url ||
              item?.file
            )
        )
        .filter(Boolean);

    }, [
      news,
    ]);


  /* ====================================================
     Loading
  ==================================================== */

  if (loading) {
    return (
      <div
        className="circular-detail"
        dir="rtl"
      >
        <div>
          در حال بارگذاری...
        </div>
      </div>
    );
  }


  /* ====================================================
     Not found
  ==================================================== */

  if (
    loadState ===
    "not-found"
  ) {
    return (
      <div
        className="circular-detail"
        dir="rtl"
      >

        <p>
          این خبر یافت نشد.
        </p>


        <div className="back-to-home">

          <button
            type="button"
            onClick={() =>
              navigate(-1)
            }
            className="back-button"
          >
            ← بازگشت به صفحه قبل
          </button>

        </div>

      </div>
    );
  }


  /* ====================================================
     Failed
  ==================================================== */

  if (
    loadState === "failed" ||
    !news
  ) {
    return (
      <div
        className="circular-detail"
        dir="rtl"
      >

        <p>
          امکان نمایش این خبر در حال حاضر وجود ندارد.
        </p>


        <div className="back-to-home">

          <button
            type="button"
            onClick={() =>
              navigate(-1)
            }
            className="back-button"
          >
            ← بازگشت به صفحه قبل
          </button>

        </div>

      </div>
    );
  }


  /* ====================================================
     Display data
  ==================================================== */

  const mainImageUrl =
    buildFileUrl(
      news?.image ||
      news?.thumbnail_url ||
      news?.thumbnail
    );


  return (
    <div
      className="circular-detail"
      dir="rtl"
    >

      <h2>
        {news.title}
      </h2>


      {/* ==========================
          Back
      ========================== */}

      <div className="back-to-home">

        <button
          type="button"
          onClick={() =>
            navigate(-1)
          }
          className="back-button"
        >
          ← بازگشت به صفحه قبل
        </button>

      </div>


      {/* ==========================
          Main image
      ========================== */}

      {mainImageUrl && (
        <img
          src={
            mainImageUrl
          }
          alt={
            news.title ||
            "خبر"
          }
          className="thumbnail"
          onError={(
            event
          ) => {
            /*
             * خرابی تصویر خودش خطای API
             * صفحه محسوب نمی‌شود.
             */
            event.currentTarget.onerror =
              null;

            event.currentTarget.style.display =
              "none";
          }}
        />
      )}


      {/* ==========================
          Content
      ========================== */}

      <p
        className="content-text"
        style={{
          whiteSpace:
            "pre-line",

          direction:
            "rtl",

          textAlign:
            "right",
        }}
      >
        {news.content}
      </p>


      {/* ==========================
          Extra images
      ========================== */}

      {fullImages.length > 0 && (
        <div className="extra-images">

          <h4>
            تصاویر بیشتر:
          </h4>


          <div className="images-gallery">

            {fullImages.map(
              (
                src,
                index
              ) => (
                <img
                  key={`${src}-${index}`}
                  src={
                    src
                  }
                  alt={`پیوست ${index + 1}`}
                  className="zoomable-image"
                  onClick={() => {
                    setSelectedIndex(
                      index
                    );

                    setLightboxOpen(
                      true
                    );
                  }}
                  onError={(
                    event
                  ) => {
                    event.currentTarget.onerror =
                      null;

                    event.currentTarget.style.display =
                      "none";
                  }}
                />
              )
            )}

          </div>

        </div>
      )}


      {/* ==========================
          Lightbox
      ========================== */}

      {lightboxOpen &&
        fullImages.length > 0 && (
        <AdvancedLightbox
          images={
            fullImages
          }
          initialIndex={
            selectedIndex
          }
          onClose={() =>
            setLightboxOpen(
              false
            )
          }
        />
      )}


      {/* ==========================
          Meta
      ========================== */}

      <div className="meta-info">

        {news.author_name && (
          <p>
            نویسنده:{" "}
            {news.author_name}
          </p>
        )}


        {news.created_at && (
          <p>
            تاریخ انتشار:{" "}
            {new Date(
              news.created_at
            ).toLocaleString(
              "fa-IR"
            )}
          </p>
        )}

      </div>

    </div>
  );
};


export default NewsDetail;