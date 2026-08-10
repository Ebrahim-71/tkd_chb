// src/components/Login/panel/maincontentpanel/HeyatCreateNews.jsx

import React, {
  useState,
} from "react";

import axios from "axios";

import {
  useNavigate,
} from "react-router-dom";

import {
  showGlobalMessage,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../../services/globalMessage";

import "../dashboard.css";


const API_BASE =
  "https://api.chbtkd.ir";


const HeyatCreateNews = () => {
  const navigate =
    useNavigate();


  const [
    title,
    setTitle,
  ] = useState("");


  const [
    content,
    setContent,
  ] = useState("");


  // تصویر شاخص
  const [
    image,
    setImage,
  ] = useState(null);


  // تصاویر الحاقی
  const [
    images,
    setImages,
  ] = useState([]);


  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  /* ======================================================
     Unauthorized
  ====================================================== */

  const handleUnauthorized =
    () => {
      localStorage.removeItem(
        "heyat_token"
      );

      localStorage.removeItem(
        "access_token"
      );

      localStorage.removeItem(
        "access"
      );

      localStorage.removeItem(
        "auth_token"
      );

      localStorage.removeItem(
        "token"
      );

      localStorage.removeItem(
        "user_role"
      );


      showGlobalMessage({
        type: "warning",

        title:
          "پایان اعتبار ورود",

        message:
          "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",

        onClose: () => {
          navigate("/");
        },
      });
    };


  /* ======================================================
     Submit
  ====================================================== */

  const handleSubmit =
    async (event) => {
      event.preventDefault();


      /* ----------------------------------------------
         Validation
      ---------------------------------------------- */

      if (
        !title.trim() ||
        !content.trim() ||
        !image
      ) {
        showGlobalWarning(
          "عنوان، متن خبر و تصویر شاخص الزامی است.",
          "اطلاعات خبر ناقص است"
        );

        return;
      }


      const token =
        localStorage.getItem(
          "heyat_token"
        );


      if (!token) {
        handleUnauthorized();

        return;
      }


      /* ----------------------------------------------
         FormData
      ---------------------------------------------- */

      const form =
        new FormData();


      form.append(
        "title",
        title.trim()
      );


      form.append(
        "content",
        content.trim()
      );


      // تصویر شاخص
      form.append(
        "image",
        image
      );


      // تصاویر الحاقی
      images.forEach(
        (item) => {
          form.append(
            "images",
            item
          );
        }
      );


      try {
        setSubmitting(
          true
        );


        await axios.post(
          `${API_BASE}/api/news/board/submit/`,
          form,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },

            /*
             * خود Axios هنگام FormData
             * Content-Type و boundary صحیح
             * را تنظیم می‌کند.
             */

            /*
             * چون این فایل خودش خطا را
             * مدیریت می‌کند، interceptor
             * نباید مودال تکراری بسازد.
             */
            skipGlobalError:
              true,
          }
        );


        /* --------------------------------------------
           Success
        -------------------------------------------- */

        showGlobalSuccess(
          "خبر با موفقیت ثبت شد و برای تأیید ادمین ارسال گردید.",
          "ارسال موفق خبر"
        );


        setTitle("");
        setContent("");
        setImage(null);
        setImages([]);


        const mainInput =
          document.getElementById(
            "main-image"
          );


        const extraInput =
          document.getElementById(
            "extra-images"
          );


        if (mainInput) {
          mainInput.value =
            "";
        }


        if (extraInput) {
          extraInput.value =
            "";
        }

      } catch (error) {
        console.error(
          "HEYAT_CREATE_NEWS_ERROR",
          error
        );


        /* --------------------------------------------
           Unauthorized
        -------------------------------------------- */

        if (
          error?.response
            ?.status === 401
        ) {
          handleUnauthorized();

          return;
        }


        /* --------------------------------------------
           Backend message
        -------------------------------------------- */

        const data =
          error?.response
            ?.data;


        let message =
          data?.detail ||
          data?.message ||
          data?.error ||
          null;


        /*
         * خطاهای serializer
         */
        if (
          !message &&
          data &&
          typeof data ===
            "object"
        ) {
          const messages =
            Object.entries(
              data
            )
              .flatMap(
                ([
                  field,
                  value,
                ]) => {
                  const values =
                    Array.isArray(
                      value
                    )
                      ? value
                      : [value];


                  return values
                    .filter(Boolean)
                    .map(
                      (item) =>
                        `${field}: ${String(
                          item
                        )}`
                    );
                }
              );


          if (
            messages.length
          ) {
            message =
              messages.join(
                "\n"
              );
          }
        }


        /*
         * فایل خیلی بزرگ
         */
        if (
          error?.response
            ?.status === 413
        ) {
          message =
            "حجم تصویر یا فایل‌های انتخاب‌شده بیش از حد مجاز است.";
        }


        showGlobalMessage({
          type: "error",

          title:
            "خطا در ثبت خبر",

          message:
            message ||
            error?.message ||
            "خبر ثبت نشد. لطفاً دوباره تلاش کنید.",
        });

      } finally {
        setSubmitting(
          false
        );
      }
    };


  /* ======================================================
     UI
  ====================================================== */

  return (
    <div
      className="item-card"
      style={{
        maxWidth: 720,
        margin:
          "0 auto",
        textAlign:
          "right",
      }}
      dir="rtl"
    >

      <h2>
        ایجاد خبر هیئت شهرستان
      </h2>


      <form
        onSubmit={
          handleSubmit
        }
      >

        <label>
          عنوان:

          <input
            type="text"
            value={
              title
            }
            onChange={(
              event
            ) =>
              setTitle(
                event.target
                  .value
              )
            }
            disabled={
              submitting
            }
          />
        </label>


        <label>
          متن خبر:

          <textarea
            rows={8}
            value={
              content
            }
            onChange={(
              event
            ) =>
              setContent(
                event.target
                  .value
              )
            }
            disabled={
              submitting
            }
          />
        </label>


        <label>
          تصویر شاخص (jpg/png):

          <input
            id="main-image"
            type="file"
            accept="image/*"
            onChange={(
              event
            ) =>
              setImage(
                event.target
                  .files?.[0] ||
                null
              )
            }
            disabled={
              submitting
            }
          />
        </label>


        <label>
          تصاویر الحاقی (چندتایی):

          <input
            id="extra-images"
            type="file"
            accept="image/*"
            multiple
            onChange={(
              event
            ) =>
              setImages(
                Array.from(
                  event.target
                    .files ||
                  []
                )
              )
            }
            disabled={
              submitting
            }
          />
        </label>


        <button
          type="submit"
          className="logout-btn"
          disabled={
            submitting
          }
          style={{
            marginTop:
              12,
          }}
        >
          {submitting
            ? "در حال ارسال..."
            : "ارسال برای تأیید"}
        </button>

      </form>

    </div>
  );
};


export default HeyatCreateNews;