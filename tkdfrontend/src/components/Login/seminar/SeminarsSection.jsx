// src/components/seminar/SeminarsSection.jsx

import React, {
  useEffect,
  useState,
} from "react";

import axios from "axios";

import SeminarCard from "./SeminarCard";

import {
  showGlobalError,
} from "../../..//services/globalMessage";


const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  "https://api.chbtkd.ir";


const SeminarsSection = ({
  role,
}) => {
  const safeRole =
    (
      role ||
      localStorage.getItem(
        "user_role"
      ) ||
      "player"
    ).toLowerCase();


  const [items, setItems] =
    useState([]);

  const [show, setShow] =
    useState("upcoming");

  const [loading, setLoading] =
    useState(true);


  // ==============================
  // دریافت سمینارها
  // ==============================

  useEffect(() => {
    const controller =
      new AbortController();


    const load =
      async () => {
        setLoading(true);


        try {
          const { data } =
            await axios.get(
              `${API_BASE}/api/competitions/seminars/sidebar/`,
              {
                params: {
                  role:
                    safeRole,

                  show,

                  limit: 12,
                },

                signal:
                  controller.signal,

                // خطا را همین فایل
                // با عنوان مناسب نمایش می‌دهد.
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          setItems(
            Array.isArray(data)
              ? data
              : Array.isArray(
                  data?.results
                )
              ? data.results
              : []
          );

        } catch (err) {
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
            "SEMINARS_LOAD_ERROR",
            err
          );


          showGlobalError(
            err,
            {
              title:
                "خطا در دریافت لیست سمینارها",
            }
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    load();


    return () => {
      controller.abort();
    };

  }, [
    safeRole,
    show,
  ]);


  // ==============================
  // استایل دکمه فیلتر
  // ==============================

  const btnStyle = (
    active
  ) => ({
    padding:
      "8px 12px",

    border:
      "1px solid #222",

    borderRadius: 8,

    background:
      active
        ? "rgb(141 157 255)"
        : "#fff",

    fontFamily:
      "IRANSansWeb",

    cursor:
      "pointer",
  });


  // ==============================
  // Render
  // ==============================

  return (
    <div
      style={{
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          margin:
            "15px 0 12px",
          flexWrap: "wrap",
        }}
      >

        <button
          type="button"
          aria-pressed={
            show === "open"
          }
          onClick={() =>
            setShow("open")
          }
          style={btnStyle(
            show === "open"
          )}
        >
          در حال ثبت‌نام
        </button>


        <button
          type="button"
          aria-pressed={
            show === "upcoming"
          }
          onClick={() =>
            setShow(
              "upcoming"
            )
          }
          style={btnStyle(
            show ===
              "upcoming"
          )}
        >
          رویدادهای آینده
        </button>


        <button
          type="button"
          aria-pressed={
            show === "past"
          }
          onClick={() =>
            setShow("past")
          }
          style={btnStyle(
            show === "past"
          )}
        >
          گذشته
        </button>


        <button
          type="button"
          aria-pressed={
            show === "all"
          }
          onClick={() =>
            setShow("all")
          }
          style={btnStyle(
            show === "all"
          )}
        >
          همه
        </button>

      </div>


      {loading ? (
        <p>
          در حال بارگذاری…
        </p>
      ) : items.length === 0 ? (
        <p>
          موردی یافت نشد.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            justifyItems:
              "center",
          }}
        >
          {items.map(
            (seminar) => (
              <SeminarCard
                key={
                  seminar.public_id ||
                  seminar.id
                }
                seminar={
                  seminar
                }
              />
            )
          )}
        </div>
      )}

    </div>
  );
};


export default SeminarsSection;