import React, {
  useEffect,
  useState,
} from "react";

import axios from "axios";
import { useNavigate } from "react-router-dom";

import PaginatedList from "../../../common/PaginatedList";
import Modal from "../../../common/Modal";

import {
  showGlobalError,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../../services/globalMessage";

import "./ClubCoachesManagement.css";


const API_BASE =
  "https://api.chbtkd.ir";


const ClubCoachesManagement = () => {
  const [
    allCoaches,
    setAllCoaches,
  ] = useState([]);

  const [
    selectedCoaches,
    setSelectedCoaches,
  ] = useState([]);

  const [modal, setModal] =
    useState(null);

  const [
    confirmChanges,
    setConfirmChanges,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [initialLoading, setInitialLoading] =
    useState(true);

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
  // مدیریت نشست نامعتبر
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
  // دریافت لیست مربیان
  // ==============================

  useEffect(() => {
    const controller =
      new AbortController();


    const fetchCoaches =
      async () => {
        if (!role || !token) {
          showGlobalWarning(
            "اطلاعات ورود شما یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
            "نیاز به ورود مجدد"
          );

          setInitialLoading(false);
          navigate("/");

          return;
        }


        try {
          const res =
            await axios.get(
              `${API_BASE}/api/auth/club/all-coaches/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                // خطا را خود این فایل
                // مدیریت می‌کند.
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          const coaches =
            Array.isArray(res?.data)
              ? res.data
              : [];


          const active =
            coaches
              .filter(
                (coach) =>
                  coach?.is_active
              )
              .map(
                (coach) =>
                  coach.id
              );


          setAllCoaches(
            coaches
          );

          setSelectedCoaches(
            active
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
            "CLUB_COACHES_LOAD_ERROR",
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
                "خطا در دریافت لیست مربیان",
            }
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setInitialLoading(false);
          }
        }
      };


    fetchCoaches();


    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, token, navigate]);


  // ==============================
  // انتخاب / حذف مربی
  // ==============================

  const toggleCoach = (
    coach
  ) => {
    if (
      coach?.pending_status
    ) {
      showGlobalWarning(
        "برای این مربی یک درخواست در حال بررسی وجود دارد و تا تعیین تکلیف آن امکان تغییر وجود ندارد.",
        "درخواست در حال بررسی"
      );

      return;
    }


    if (
      selectedCoaches.includes(
        coach.id
      )
    ) {
      setModal({
        type: "remove",
        coach,
      });

      return;
    }


    if (
      Number(
        coach?.club_count || 0
      ) >= 3
    ) {
      showGlobalWarning(
        `مربی ${coach.full_name || ""} در ۳ باشگاه ثبت شده است و امکان انتخاب او وجود ندارد.`,
        "حداکثر ظرفیت باشگاه"
      );

      return;
    }


    setSelectedCoaches(
      (prev) => [
        ...prev,
        coach.id,
      ]
    );
  };


  // ==============================
  // تأیید حذف مربی
  // ==============================

  const handleRemoveConfirmed =
    () => {
      if (!modal?.coach?.id) {
        setModal(null);
        return;
      }


      setSelectedCoaches(
        (prev) =>
          prev.filter(
            (id) =>
              id !==
              modal.coach.id
          )
      );


      setModal(null);
    };


  // ==============================
  // بازکردن تأیید نهایی
  // ==============================

  const handleSubmit = () => {
    if (loading) {
      return;
    }


    setConfirmChanges(true);
  };


  // ==============================
  // ارسال تغییرات
  // ==============================

  const confirmFinalSubmit =
    async () => {
      if (!token) {
        setConfirmChanges(false);

        showGlobalWarning(
          "اطلاعات ورود شما یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
          "نیاز به ورود مجدد"
        );

        navigate("/");

        return;
      }


      try {
        setLoading(true);


        const res =
          await axios.post(
            `${API_BASE}/api/auth/club/update-coaches/`,
            {
              selected_coaches:
                selectedCoaches,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },

              // جلوگیری از نمایش
              // دوباره خطا توسط
              // Axios interceptor
              skipGlobalError: true,
            }
          );


        const successMessage =
          res?.data?.message ||
          "درخواست‌های تغییر مربیان با موفقیت ارسال شدند.";


        showGlobalSuccess(
          successMessage,
          "درخواست‌ها ارسال شدند"
        );


      } catch (err) {
        console.error(
          "CLUB_COACHES_UPDATE_ERROR",
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
              "خطا در ارسال درخواست‌های مربیان",
          }
        );

      } finally {
        setLoading(false);
        setConfirmChanges(false);
      }
    };


  // ==============================
  // Loading اولیه
  // ==============================

  if (initialLoading) {
    return (
      <p className="loading-text">
        در حال دریافت لیست مربیان...
      </p>
    );
  }


  // ==============================
  // Render
  // ==============================

  return (
    <div className="club-coaches-management">

      <h2>
        مدیریت مربیان باشگاه
      </h2>


      <div className="coach-table-header">
        <div>
          نام مربی
        </div>

        <div>
          کد ملی
        </div>

        <div>
          درجه کمربند
        </div>

        <div>
          موبایل
        </div>

        <div>
          انتخاب
        </div>
      </div>


      {allCoaches.length === 0 ? (
        <p
          style={{
            textAlign: "center",
          }}
        >
          مربی‌ای برای نمایش وجود ندارد.
        </p>
      ) : (
        <PaginatedList
          items={allCoaches}
          itemsPerPage={10}
          renderItem={(
            coach,
            index
          ) => (
            <div
              key={
                coach.id ||
                coach.national_code ||
                index
              }
              className="coach-row"
            >
              <div
                data-label="نام مربی"
              >
                {coach.full_name ||
                  "-"}


                {coach.pending_status && (
                  <span className="pending-badge">
                    {coach.pending_status ===
                    "add"
                      ? " (در انتظار افزودن)"
                      : coach.pending_status ===
                        "remove"
                      ? " (در انتظار حذف)"
                      : " (در انتظار بررسی)"}
                  </span>
                )}
              </div>


              <div
                data-label="کد ملی"
              >
                {coach.national_code ||
                  "-"}
              </div>


              <div
                data-label="درجه کمربند"
              >
                {coach.belt_grade ||
                  "-"}
              </div>


              <div
                data-label="موبایل"
              >
                {coach.phone ||
                  "-"}
              </div>


              <div
                data-label="انتخاب"
              >
                <input
                  type="checkbox"
                  checked={
                    selectedCoaches.includes(
                      coach.id
                    )
                  }
                  disabled={
                    !!coach.pending_status ||
                    loading
                  }
                  onChange={() =>
                    toggleCoach(
                      coach
                    )
                  }
                />
              </div>

            </div>
          )}
        />
      )}


      <div className="submit-wrapper">
        <button
          type="button"
          className="confirm-btn"
          onClick={
            handleSubmit
          }
          disabled={
            loading ||
            allCoaches.length === 0
          }
        >
          {loading
            ? "در حال ارسال..."
            : "تأیید"}
        </button>
      </div>


      {/* ==========================
          تأیید حذف مربی
      ========================== */}

      {modal && (
        <Modal
          title="حذف مربی"
          message={
            `آیا مطمئن هستید که مربی ${
              modal.coach?.full_name ||
              ""
            } را می‌خواهید از باشگاه حذف کنید؟`
          }
          onConfirm={
            handleRemoveConfirmed
          }
          onCancel={() =>
            setModal(null)
          }
        />
      )}


      {/* ==========================
          تأیید نهایی تغییرات
      ========================== */}

      {confirmChanges && (
        <Modal
          title="تأیید نهایی"
          message="آیا از تغییرات انجام‌شده در فهرست مربیان مطمئن هستید؟ درخواست‌ها پس از ارسال برای بررسی ثبت خواهند شد."
          onConfirm={
            confirmFinalSubmit
          }
          onCancel={() =>
            !loading &&
            setConfirmChanges(
              false
            )
          }
        />
      )}

    </div>
  );
};


export default ClubCoachesManagement;