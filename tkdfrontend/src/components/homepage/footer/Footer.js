import React from "react";
import {
  FaPhoneAlt,
  FaMapMarkerAlt,
  FaClock,
} from "react-icons/fa";

import instagramIcon from "../../../assets/icons/instagram.png";
import eitaaIcon from "../../../assets/icons/eitaa-icon-colorful.png";

import "./Footer.css";

const Footer = () => {
  return (
    <footer className="tkd-footer">
      <div className="tkd-footer-inner">

        <section className="tkd-footer-block tkd-footer-about">
          <h4>  
            هیئت تکواندو چهارمحال و بختیاری
          </h4>

          <p>
            سامانه رسمی اطلاع‌رسانی، ثبت‌نام و مدیریت
            خدمات ورزشی هیئت تکواندو استان.
          </p>

          <div className="tkd-footer-socials">
            <a
              href="https://www.instagram.com/taekwondo.sh.k?igsh=MXhiMjlzaWFycHFwYw=="
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <img
                src={instagramIcon}
                alt="Instagram"
              />
            </a>

            <a
              href="https://eitaa.com/tkdchb"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Eitaa"
            >
              <img
                src={eitaaIcon}
                alt="Eitaa"
              />
            </a>
          </div>
        </section>


        <section className="tkd-footer-block">
          <h4>
            اطلاعات تماس
          </h4>

          <p>
            <FaMapMarkerAlt />
            <span>
              شهرکرد، میدان امام حسین، اداره ورزش و جوانان،
              هیئت تکواندو استان
            </span>
          </p>

          <p>
            <FaPhoneAlt />
            <span>
              ۰۳۸۳۲۲۲۶۶۸۶
            </span>
          </p>

          <p>
            <FaClock />
            <span>
              شنبه تا چهارشنبه، ساعات اداری
            </span>
          </p>
        </section>


        <section className="tkd-footer-block tkd-footer-trust">
          <h4>
            نماد اعتماد
          </h4>

          <a
            referrerPolicy="origin"
            target="_blank"
            href="https://trustseal.enamad.ir/?id=636870&Code=x1lplc0ZDZMN7mttg9wrM5tSQhll3IyU"
            rel="noopener noreferrer"
          >
            <img
              referrerPolicy="origin"
              src="https://trustseal.enamad.ir/logo.aspx?id=636870&Code=x1lplc0ZDZMN7mttg9wrM5tSQhll3IyU"
              alt="نماد اعتماد الکترونیکی"
              className="tkd-enamad-logo"
            />
          </a>
        </section>

      </div>


      <div className="tkd-footer-bottom">
        © {new Date().getFullYear()} هیئت تکواندو
        چهارمحال و بختیاری - تمامی حقوق محفوظ است.
      </div>
    </footer>
  );
};

export default Footer;
