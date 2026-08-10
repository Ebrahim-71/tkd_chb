// src/pages/CircularDetail.js

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

import pdf_icon from "../assets/icons/pdf-icon.png";

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
    typeof payload ===
      "string" &&
    payload.trim()
  ) {
    return payload.trim();
  }


  const direct =
    payload?.detail ||
    payload?.message ||
    payload?.error;


  if (
    typeof direct ===
      "string" &&
    direct.trim()
  ) {
    return direct.trim();
  }


  if (
    Array.isArray(
      direct
    )
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

const CircularDetail = () => {
  const {
    id,
  } = useParams();


  const navigate =
    useNavigate();


  const [
    circular,
    setCircular,
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
     Load circular
  ==================================================== */

  useEffect(() => {
    const controller =
      new AbortController();


    const loadCircular =
      async () => {
        setLoading(true);

        setLoadState(
          "loading"
        );

        setCircular(
          null
        );


        try {
          const response =
            await apiFetchSilent(
              `${API_BASE}/api/circulars/${encodeURIComponent(
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
            controller.signal
              .aborted
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
             404 = وضعیت عادی صفحه
          ============================================ */

          if (
            response.status ===
            404
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
                "خطا در دریافت اطلاعیه",

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
                "خطا در دریافت اطلاعیه",

              message:
                getErrorMessage(
                  payload,
                  "اطلاعات اطلاعیه از سرور دریافت نشد."
                ),
            });


            return;
          }


          setCircular(
            payload
          );


          setLoadState(
            "ready"
          );

        } catch (error) {
          if (
            controller.signal
              .aborted ||
            error?.name ===
              "AbortError" ||
            error?.name ===
              "CanceledError" ||
            error?.code ===
              "ERR_CANCELED"
          ) {
            return;
          }


          console.error(
            "CIRCULAR_DETAIL_LOAD_ERROR",
            error
          );


          setLoadState(
            "failed"
          );


          showGlobalMessage({
            type: "error",

            title:
              "خطا در دریافت اطلاعیه",

            message:
              error?.message ||
              "ارتباط با سرور برای دریافت جزئیات اطلاعیه برقرار نشد.",
          });

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


    loadCircular();


    return () => {
      controller.abort();
    };

  }, [id]);


  /* ====================================================
     Attachments
  ==================================================== */

  const fullImages =
    useMemo(() => {
      const images =
        Array.isArray(
          circular?.images
        )
          ? circular.images
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
      circular,
    ]);


  const pdfAttachments =
    useMemo(
      () =>
        Array.isArray(
          circular
            ?.attachments
        )
          ? circular.attachments
          : [],
      [circular]
    );


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
          این اطلاعیه یافت نشد.
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
    loadState ===
      "failed" ||
    !circular
  ) {
    return (
      <div
        className="circular-detail"
        dir="rtl"
      >

        <p>
          امکان نمایش این اطلاعیه در حال حاضر وجود ندارد.
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

  const thumbnailUrl =
    buildFileUrl(
      circular
        ?.thumbnail_url ||
      circular
        ?.thumbnail ||
      circular
        ?.image
    );


  return (
    <div
      className="circular-detail"
      dir="rtl"
    >

      <h2>
        {circular.title}
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
          Thumbnail
      ========================== */}

      {thumbnailUrl && (
        <img
          src={
            thumbnailUrl
          }
          alt={
            circular.title ||
            "اطلاعیه"
          }
          className="thumbnail"
          onError={(
            event
          ) => {
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
        {circular.content}
      </p>


      {/* ==========================
          Extra images
      ========================== */}

      {fullImages.length >
        0 && (
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
        fullImages.length >
          0 && (
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
          PDF attachments
      ========================== */}

      {pdfAttachments.length >
        0 && (
        <div>

          <h4>
            فایل‌های پیوست:
          </h4>


          <div className="pdf-attachments">

            {pdfAttachments.map(
              (
                attachment,
                index
              ) => {
                const fileUrl =
                  buildFileUrl(
                    attachment
                      ?.file ||
                    attachment
                      ?.url
                  );


                if (!fileUrl) {
                  return null;
                }


                return (
                  <a
                    key={
                      attachment?.id ??
                      `${fileUrl}-${index}`
                    }
                    href={
                      fileUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`دانلود فایل ${index + 1}`}
                  >
                    <img
                      src={
                        pdf_icon
                      }
                      alt={`PDF ${index + 1}`}
                    />
                  </a>
                );
              }
            )}

          </div>

        </div>
      )}


      {/* ==========================
          Meta
      ========================== */}

      <div className="meta-info">

        {circular
          .author_name && (
          <p>
            منتشرکننده:{" "}
            {circular.author_name}
          </p>
        )}


        {circular
          .created_at && (
          <p>
            تاریخ انتشار:{" "}
            {new Date(
              circular.created_at
            ).toLocaleString(
              "fa-IR"
            )}
          </p>
        )}

      </div>

    </div>
  );
};


export default CircularDetail;