// src/components/Login/panel/maincontentpanel/CoachRequests.jsx

import React, {
  useEffect,
  useState,
} from "react";

import axios from "axios";
import { useNavigate } from "react-router-dom";

import {
  showGlobalError,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../../services/globalMessage";

import "./CoachRequests.css";


const API_BASE =
  "https://api.chbtkd.ir";


const CoachRequests = () => {
  const [requests, setRequests] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    respondingId,
    setRespondingId,
  ] = useState(null);


  const navigate =
    useNavigate();


  const role =
    localStorage.getItem(
      "user_role"
    );

  const token =
    role
      ? localStorage.getItem(
          `${role}_token`
        )
      : null;


  // ==============================
  // خروج کاربر در صورت 401
  // ==============================

  const handleUnauthorized = () => {
    if (role) {
      localStorage.removeItem(
        `${role}_token`
      );
    }

    localStorage.removeItem(
      "user_role"
    );


    showGlobalWarning(
      "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",
      "پایان اعتبار ورود"
    );


    navigate("/");
  };


  // ==============================
  // دریافت درخواست‌های باشگاه
  // ==============================

  useEffect(() => {
    const controller =
      new AbortController();


    const fetchRequests =
      async () => {
        if (!role || !token) {
          showGlobalWarning(
            "اطلاعات ورود شما یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
            "نیاز به ورود مجدد"
          );

          setLoading(false);

          navigate("/");
          return;
        }


        try {
          const res =
            await axios.get(
              `${API_BASE}/api/auth/coach/requests/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                // چون خطا را اینجا
                // مدیریت می‌کنیم،
                // interceptor نباید
                // Modal دوم ایجاد کند.
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          const responseData =
            Array.isArray(res?.data)
              ? res.data
              : [];


          setRequests(
            responseData
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
            "COACH_REQUESTS_LOAD_ERROR",
            err
          );


          if (
            err?.response?.status ===
            401
          ) {
            handleUnauthorized();
            return;
          }


          showGlobalError(
            err,
            {
              title:
                "خطا در دریافت درخواست‌های باشگاه",
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


    fetchRequests();


    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, token, navigate]);


  // ==============================
  // پاسخ به درخواست
  // ==============================

  const respond = async (
    id,
    action
  ) => {
    if (
      action !== "accept" &&
      action !== "reject"
    ) {
      showGlobalWarning(
        "نوع عملیات انتخاب‌شده معتبر نیست.",
        "عملیات نامعتبر"
      );

      return;
    }


    if (!token) {
      showGlobalWarning(
        "اطلاعات ورود شما یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
        "نیاز به ورود مجدد"
      );

      navigate("/");
      return;
    }


    if (respondingId !== null) {
      return;
    }


    setRespondingId(id);


    try {
      await axios.post(
        `${API_BASE}/api/auth/coach/requests/${id}/respond/`,
        {
          action,
        },
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },

          // جلوگیری از نمایش
          // دو خطای همزمان
          skipGlobalError: true,
        }
      );


      const newStatus =
        action === "accept"
          ? "accepted"
          : "rejected";


      setRequests(
        (prev) =>
          prev.map(
            (request) =>
              request.id === id
                ? {
                    ...request,
                    status:
                      newStatus,
                  }
                : request
          )
      );


      showGlobalSuccess(
        action === "accept"
          ? "درخواست باشگاه با موفقیت تأیید شد."
          : "درخواست باشگاه با موفقیت رد شد.",
        action === "accept"
          ? "درخواست تأیید شد"
          : "درخواست رد شد"
      );

    } catch (err) {
      console.error(
        "COACH_REQUEST_RESPOND_ERROR",
        err
      );


      if (
        err?.response?.status ===
        401
      ) {
        handleUnauthorized();
        return;
      }


      showGlobalError(
        err,
        {
          title:
            action === "accept"
              ? "خطا در تأیید درخواست"
              : "خطا در رد درخواست",
        }
      );

    } finally {
      setRespondingId(null);
    }
  };


  // ==============================
  // وضعیت فارسی درخواست
  // ==============================

  const getStatusLabel = (
    status
  ) => {
    switch (status) {
      case "pending":
        return "در انتظار";

      case "accepted":
        return "تأیید شده";

      case "rejected":
        return "رد شده";

      default:
        return "نامشخص";
    }
  };


  // ==============================
  // نوع درخواست
  // ==============================

  const getRequestTypeLabel = (
    type
  ) => {
    switch (type) {
      case "add":
        return "افزودن";

      case "remove":
        return "حذف";

      default:
        return type || "-";
    }
  };


  // ==============================
  // Loading
  // ==============================

  if (loading) {
    return (
      <p className="loading-text">
        در حال دریافت درخواست‌ها...
      </p>
    );
  }


  // ==============================
  // Render
  // ==============================

  return (
    <div className="coach-requests-container">

      <h2>
        درخواست‌های باشگاه‌ها
      </h2>


      {requests.length === 0 ? (
        <p
          style={{
            textAlign: "center",
          }}
        >
          درخواستی وجود ندارد.
        </p>
      ) : (
        <div className="requests-table">

          <div className="table-header">
            <div>
              باشگاه
            </div>

            <div>
              نوع درخواست
            </div>

            <div>
              وضعیت
            </div>

            <div>
              اقدام
            </div>
          </div>


          {requests.map(
            (request, index) => (
              <div
                className={
                  `table-row ${
                    index % 2 === 0
                      ? "row-light"
                      : "row-dark"
                  }`
                }
                key={
                  request.id
                }
              >
                <div
                  data-label="باشگاه"
                >
                  {request.club_name ||
                    "-"}
                </div>


                <div
                  data-label="نوع درخواست"
                >
                  {getRequestTypeLabel(
                    request.request_type
                  )}
                </div>


                <div
                  data-label="وضعیت"
                >
                  {getStatusLabel(
                    request.status
                  )}
                </div>


                <div
                  data-label="اقدام"
                >
                  {request.status ===
                    "pending" ? (
                    <>
                      <button
                        type="button"
                        className="btn-accept"
                        onClick={() =>
                          respond(
                            request.id,
                            "accept"
                          )
                        }
                        disabled={
                          respondingId !==
                          null
                        }
                      >
                        {respondingId ===
                        request.id
                          ? "در حال ثبت..."
                          : "تأیید"}
                      </button>


                      {" "}


                      <button
                        type="button"
                        className="btn-reject"
                        onClick={() =>
                          respond(
                            request.id,
                            "reject"
                          )
                        }
                        disabled={
                          respondingId !==
                          null
                        }
                      >
                        {respondingId ===
                        request.id
                          ? "در حال ثبت..."
                          : "رد"}
                      </button>
                    </>
                  ) : (
                    <span>
                      —
                    </span>
                  )}
                </div>

              </div>
            )
          )}

        </div>
      )}

    </div>
  );
};


export default CoachRequests;