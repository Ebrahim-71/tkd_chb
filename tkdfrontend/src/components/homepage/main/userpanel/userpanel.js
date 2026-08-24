// src/components/pages/home/sections/userpanel/UserPanel.jsx

import React, { useState } from "react";
import "./userpanel.css";

import playerImg from "../../../../assets/img/player.png";
import coachImg from "../../../../assets/img/coach.png";
import clubImg from "../../../../assets/img/club.png";
import heyatImg from "../../../../assets/img/heyat.png";

import PlayerRegisterModal from "../../../Register/RegisterModal.jsx";
import LoginModal from "../../../Login/LoginModal.jsx";
import ForgotPasswordModal from "../../../Login/ForgotPasswordModal.jsx";


const panelItems = [
  {
    title: "بازیکن",
    description:
      "ثبت‌نام در مسابقات، مشاهده نتایج و رتبه‌بندی",
    image: playerImg,
    accent: "#1685ff",
    rgb: "22, 133, 255",
  },

  {
    title: "مربی / داور",
    description:
      "مدیریت تیم‌ها، ورزشکاران، برنامه مسابقات و نتایج",
    image: coachImg,
    accent: "#a855f7",
    rgb: "168, 85, 247",
  },

  {
    title: "باشگاه",
    description:
      "مدیریت باشگاه، اعضا، گزارش‌ها و عملکرد",
    image: clubImg,
    accent: "#00c99a",
    rgb: "0, 201, 154",
  },

  {
    title: "هیأت",
    description:
      "مدیریت مسابقات، رویدادها، گزارش‌ها و آمار استان",
    image: heyatImg,
    accent: "#ef233c",
    rgb: "239, 35, 60",
  },
];


const ArrowIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);


const UserPanel = () => {

  /* =====================================================
     Register Modal
  ===================================================== */

  const [
    showRegisterModal,
    setShowRegisterModal,
  ] = useState(false);


  const [
    selectedRegisterRole,
    setSelectedRegisterRole,
  ] = useState("");


  /* =====================================================
     Login Modal
  ===================================================== */

  const [
    showLoginModal,
    setShowLoginModal,
  ] = useState(false);


  const [
    selectedLoginRoleGroup,
    setSelectedLoginRoleGroup,
  ] = useState("player");


  /* =====================================================
     Forgot Password
  ===================================================== */

  const [
    showForgotModal,
    setShowForgotModal,
  ] = useState(false);


  /* =====================================================
     Login
  ===================================================== */

  const handleLoginClick = (title) => {

    if (title === "هیأت") {

      setSelectedLoginRoleGroup(
        "heyat"
      );

    } else if (title === "بازیکن") {

      setSelectedLoginRoleGroup(
        "player"
      );

    } else if (title === "مربی / داور") {

      setSelectedLoginRoleGroup(
        "coachref"
      );

    } else if (title === "باشگاه") {

      setSelectedLoginRoleGroup(
        "club"
      );

    }


    setShowLoginModal(true);
  };


  /* =====================================================
     Register
  ===================================================== */

  const handleRegisterClick = (title) => {

    if (title === "بازیکن") {

      setSelectedRegisterRole(
        "player"
      );

    } else if (title === "مربی / داور") {

      setSelectedRegisterRole(
        "coach"
      );

    } else if (title === "باشگاه") {

      setSelectedRegisterRole(
        "club"
      );

    } else {

      return;

    }


    setShowRegisterModal(true);
  };


  /* =====================================================
     Render
  ===================================================== */

  return (
    <>

      <section
        id="tkd-quick-access"
        className="tkd-quick-access"
      >

        <div className="tkd-quick-container">

          {/* =============================================
              Heading
          ============================================= */}

          <div className="tkd-quick-heading">

            <div className="tkd-heading-line" />

            <div className="tkd-heading-content">

              <span>
                پنل کاربران
              </span>

              <h2>
                دسترسی سریع
              </h2>

              <p>
                متناسب با نقش خود وارد بخش مورد نظر شوید
              </p>

            </div>

            <div className="tkd-heading-line" />

          </div>


          {/* =============================================
              Cards
          ============================================= */}

          <div className="tkd-access-grid">

            {panelItems.map((item) => (

              <article
                key={item.title}
                className="tkd-access-card"
                style={{
                  "--card-accent":
                    item.accent,

                  "--card-accent-rgb":
                    item.rgb,
                }}
              >

                {/* تصویر */}

                <img
                  src={item.image}
                  alt=""
                  className="tkd-access-image"
                />


                {/* افکت رنگی */}

                <div
                  className="tkd-access-color"
                  aria-hidden="true"
                />


                <div
                  className="tkd-access-dark"
                  aria-hidden="true"
                />


                {/* Decorative */}

                <div
                  className="tkd-access-decoration"
                  aria-hidden="true"
                >
                  <span />
                </div>


                {/* محتوا */}

                <div className="tkd-access-content">

                  <div className="tkd-access-icon">

                    <span className="tkd-access-icon-dot" />

                  </div>


                  <div className="tkd-access-text">

                    <h3>
                      {item.title}
                    </h3>

                    <p>
                      {item.description}
                    </p>

                  </div>


                  <div className="tkd-access-actions">

                    <button
                      type="button"
                      className="tkd-access-login"
                      onClick={() =>
                        handleLoginClick(
                          item.title
                        )
                      }
                    >

                      <span>
                        ورود
                      </span>

                      <span className="tkd-action-icon">
                        <ArrowIcon />
                      </span>

                    </button>


                    {item.title !==
                      "هیأت" && (

                      <button
                        type="button"
                        className="tkd-access-register"
                        onClick={() =>
                          handleRegisterClick(
                            item.title
                          )
                        }
                      >
                        ثبت‌نام
                      </button>

                    )}

                  </div>

                </div>

              </article>

            ))}

          </div>

        </div>

      </section>


      {/* =================================================
          Register
      ================================================= */}

      {showRegisterModal && (

        <PlayerRegisterModal
          role={
            selectedRegisterRole
          }
          onClose={() =>
            setShowRegisterModal(
              false
            )
          }
        />

      )}


      {/* =================================================
          Login
      ================================================= */}

      {showLoginModal && (

        <LoginModal
          role={
            selectedLoginRoleGroup
          }
          onClose={() =>
            setShowLoginModal(
              false
            )
          }
          onForgotPassword={() => {

            setShowLoginModal(
              false
            );

            setShowForgotModal(
              true
            );

          }}
        />

      )}


      {/* =================================================
          Forgot password
      ================================================= */}

      {showForgotModal && (

        <ForgotPasswordModal
          onClose={() =>
            setShowForgotModal(
              false
            )
          }
        />

      )}

    </>
  );

};


export default UserPanel;