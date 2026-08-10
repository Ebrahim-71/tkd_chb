// src/components/Login/competitions/PoomsaeDrawView.jsx

import React, {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  apiFetchSilent,
} from "../../../api/apiClient";

import {
  showGlobalMessage,
  showGlobalWarning,
} from "../../../services/globalMessage";

import "./PoomsaeDrawView.css";


/* ======================================================
   Constants
====================================================== */

const API_ROOT =
  "https://api.chbtkd.ir/api/competitions";


/* ======================================================
   Helpers
====================================================== */

const toFa = (
  value
) =>
  String(value ?? "").replace(
    /\d/g,
    (digit) =>
      "۰۱۲۳۴۵۶۷۸۹"[digit]
  );


const showValue = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  return toFa(value);
};


/* ======================================================
   Component
====================================================== */

export default function PoomsaeDrawView() {
  const {
    slug,
    role,
  } = useParams();

  const navigate =
    useNavigate();


  const [
    drawData,
    setDrawData,
  ] = useState(null);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadState,
    setLoadState,
  ] = useState("ready");
  // ready | not-published | failed


  /* ====================================================
     Load draw
  ==================================================== */

  useEffect(() => {
    let mounted = true;

    const controller =
      new AbortController();


    const loadDraw =
      async () => {
        setLoading(true);
        setLoadState(
          "ready"
        );
        setDrawData(
          null
        );


        try {
          const url =
            `${API_ROOT}/by-public/` +
            `${encodeURIComponent(
              slug
            )}/` +
            "poomsae-draw/";


          /*
           * عمداً Silent:
           *
           * چون 404 در این endpoint
           * الزاماً خطای واقعی نیست و
           * می‌تواند فقط یعنی:
           * «قرعه هنوز منتشر نشده».
           */
          const response =
            await apiFetchSilent(
              url,
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
              .aborted ||
            !mounted
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
             404 = قرعه هنوز منتشر نشده
          ============================================ */

          if (
            response.status ===
            404
          ) {
            setLoadState(
              "not-published"
            );


            showGlobalWarning(
              payload?.detail ||
                "قرعه پومسه هنوز منتشر نشده است.",
              "قرعه منتشر نشده است"
            );


            return;
          }


          /* ============================================
             401 / 403
          ============================================ */

          if (
            response.status ===
              401 ||
            response.status ===
              403
          ) {
            setLoadState(
              "failed"
            );


            showGlobalMessage({
              type:
                "warning",

              title:
                "عدم دسترسی",

              message:
                payload?.detail ||
                "اجازه مشاهده قرعه این مسابقه را ندارید.",
            });


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
              type:
                "error",

              title:
                "خطا در دریافت قرعه پومسه",

              message:
                payload?.detail ||
                payload?.message ||
                payload?.error ||
                `سرور با کد ${response.status} پاسخ داد.`,
            });


            return;
          }


          /* ============================================
             پاسخ معتبر است ولی ready نیست
          ============================================ */

          if (
            !payload?.ready
          ) {
            setLoadState(
              "not-published"
            );


            showGlobalWarning(
              payload?.detail ||
                "جدول منتشرشده‌ای برای این مسابقه وجود ندارد.",
              "قرعه منتشر نشده است"
            );


            return;
          }


          /* ============================================
             Success
          ============================================ */

          setDrawData(
            payload
          );

          setLoadState(
            "ready"
          );

        } catch (
          requestError
        ) {
          if (
            controller.signal
              .aborted ||
            requestError?.name ===
              "AbortError" ||
            !mounted
          ) {
            return;
          }


          console.error(
            "POOMSAE_DRAW_ERROR:",
            requestError
          );


          setLoadState(
            "failed"
          );


          showGlobalMessage({
            type:
              "error",

            title:
              "خطا در دریافت قرعه پومسه",

            message:
              requestError
                ?.message ||
              "ارتباط با سرور برای دریافت قرعه پومسه برقرار نشد.",
          });

        } finally {
          if (
            mounted &&
            !controller.signal
              .aborted
          ) {
            setLoading(
              false
            );
          }
        }
      };


    loadDraw();


    return () => {
      mounted = false;

      controller.abort();
    };

  }, [slug]);


  /* ====================================================
     Navigation
  ==================================================== */

  const goBack =
    () => {
      navigate(
        `/dashboard/${encodeURIComponent(
          role || "coach"
        )}/competitions/${encodeURIComponent(
          slug
        )}`
      );
    };


  /* ====================================================
     Loading
  ==================================================== */

  if (loading) {
    return (
      <div
        className="pdv-page"
        dir="rtl"
      >
        <div className="pdv-loading">
          در حال دریافت قرعه پومسه…
        </div>
      </div>
    );
  }


  /* ====================================================
     Not published
  ==================================================== */

  if (
    loadState ===
    "not-published"
  ) {
    return (
      <div
        className="pdv-page"
        dir="rtl"
      >
        <div className="pdv-error">
          قرعه پومسه هنوز منتشر نشده است.
        </div>


        <button
          type="button"
          className="pdv-back"
          onClick={
            goBack
          }
        >
          بازگشت به جزئیات مسابقه
        </button>
      </div>
    );
  }


  /* ====================================================
     Real failure
  ==================================================== */

  if (
    loadState ===
      "failed" ||
    !drawData
  ) {
    return (
      <div
        className="pdv-page"
        dir="rtl"
      >
        <div className="pdv-error">
          امکان نمایش قرعه پومسه در حال حاضر وجود ندارد.
        </div>


        <button
          type="button"
          className="pdv-back"
          onClick={
            goBack
          }
        >
          بازگشت به جزئیات مسابقه
        </button>
      </div>
    );
  }


  /* ====================================================
     Data
  ==================================================== */

  const competition =
    drawData?.competition ||
    {};


  const mats =
    Array.isArray(
      drawData?.mats
    )
      ? drawData.mats
      : [];


  /* ====================================================
     Render
  ==================================================== */

  return (
    <div
      className="pdv-page"
      dir="rtl"
    >

      {/* ==========================
          Header
      ========================== */}

      <header className="pdv-header">

        <div>

          <h1 className="pdv-title">
            قرعه مسابقات پومسه
          </h1>


          <div className="pdv-subtitle">
            {competition.title ||
              "مسابقه پومسه"}
          </div>

        </div>


        <button
          type="button"
          className="pdv-back"
          onClick={
            goBack
          }
        >
          بازگشت
        </button>

      </header>


      {/* ==========================
          Summary
      ========================== */}

      <section className="pdv-summary">

        <SummaryItem
          label="تعداد زمین"
          value={
            competition
              .mat_count ??
            mats.length
          }
        />


        <SummaryItem
          label="تعداد جدول"
          value={
            competition
              .table_count ??
            0
          }
        />


        <SummaryItem
          label="تعداد شرکت‌کننده"
          value={
            competition
              .participant_count ??
            0
          }
        />


        <SummaryItem
          label="کل نوبت‌های اجرا"
          value={
            competition
              .slot_count ??
            0
          }
        />


        <SummaryItem
          label="نسخه قرعه"
          value={
            competition
              .revision ??
            0
          }
        />

      </section>


      {/* ==========================
          Mats
      ========================== */}

      <div className="pdv-mats">

        {mats.map(
          (mat) => (
            <section
              className="pdv-mat"
              key={`mat-${mat.mat_number}`}
            >

              <div className="pdv-mat-header">

                <h2>
                  زمین{" "}
                  {toFa(
                    mat.mat_number
                  )}
                </h2>


                <span>
                  {toFa(
                    mat.execution_count ??
                    0
                  )}
                  {" نوبت اجرا"}
                </span>

              </div>


              <div className="pdv-groups">

                {(mat.groups ||
                  []).map(
                  (
                    group,
                    groupIndex
                  ) => (
                    <details
                      className="pdv-group"
                      key={
                        `${group.draw_table_id}-` +
                        `${group.round_level}-` +
                        `${group.execution_start}`
                      }
                      open={
                        groupIndex ===
                        0
                      }
                    >

                      <summary className="pdv-group-summary">

                        <span className="pdv-group-title">
                          {group.section_label}
                          {" ـ "}
                          {group.belt_group}
                          {" ـ "}
                          {group.age_category}
                          {" ـ "}
                          {group.round_label}
                        </span>


                        <span className="pdv-group-range">
                          اجرای{" "}
                          {toFa(
                            group.execution_start
                          )}
                          {" تا "}
                          {toFa(
                            group.execution_end
                          )}
                        </span>

                      </summary>


                      <div className="pdv-table-wrap">

                        <table className="pdv-table">

                          <thead>
                            <tr>
                              <th>
                                شماره اجرا
                              </th>

                              <th>
                                ردیف
                              </th>

                              <th>
                                بازیکن یا تیم
                              </th>

                              <th>
                                باشگاه
                              </th>

                              <th>
                                فرم اول
                              </th>

                              <th>
                                فرم دوم
                              </th>
                            </tr>
                          </thead>


                          <tbody>

                            {(group.slots ||
                              []).map(
                              (slot) => (
                                <tr
                                  key={
                                    slot.id
                                  }
                                >

                                  <td>
                                    {showValue(
                                      slot.execution_number
                                    )}
                                  </td>


                                  <td>
                                    {showValue(
                                      slot.slot_order
                                    )}
                                  </td>


                                  <td className="pdv-name">
                                    {slot.participant_name ||
                                      ""}
                                  </td>


                                  <td>
                                    {slot.club_name ||
                                      ""}
                                  </td>


                                  <td>
                                    {showValue(
                                      slot.form_1
                                    )}
                                  </td>


                                  <td>
                                    {showValue(
                                      slot.form_2
                                    )}
                                  </td>

                                </tr>
                              )
                            )}

                          </tbody>

                        </table>

                      </div>

                    </details>
                  )
                )}

              </div>

            </section>
          )
        )}

      </div>

    </div>
  );
}


/* ======================================================
   Summary Item
====================================================== */

function SummaryItem({
  label,
  value,
}) {
  return (
    <div className="pdv-summary-item">

      <span className="pdv-summary-label">
        {label}
      </span>


      <strong className="pdv-summary-value">
        {toFa(value)}
      </strong>

    </div>
  );
}