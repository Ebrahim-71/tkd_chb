// src/components/homepage/heder/header.js

import React, {
  useEffect,
  useState,
} from "react";

import {
  apiFetchSilent,
} from "../../../api/apiClient";

import "./header.css";

import logo from "../../../assets/img/logo.png";


const API_BASE =
  "https://api.chbtkd.ir";


const Header = () => {
  const [
    backgroundImage,
    setBackgroundImage,
  ] = useState("");


  useEffect(() => {
    const controller =
      new AbortController();


    const loadBackground =
      async () => {
        try {
          const response =
            await apiFetchSilent(
              `${API_BASE}/api/header-background/`,
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


          if (
            !response?.ok
          ) {
            console.warn(
              "HEADER_BACKGROUND_HTTP_ERROR",
              response?.status
            );

            return;
          }


          let data = null;


          try {
            data =
              await response.json();
          } catch (
            parseError
          ) {
            console.warn(
              "HEADER_BACKGROUND_PARSE_ERROR",
              parseError
            );

            return;
          }


          const background =
            data?.background_image;


          if (!background) {
            return;
          }


          const fullUrl =
            String(
              background
            ).startsWith(
              "http"
            )
              ? background
              : `${API_BASE}${background}`;


          setBackgroundImage(
            fullUrl
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


          /*
           * این درخواست صرفاً برای
           * تصویر تزئینی Header است.
           * بنابراین عمداً Global Modal
           * نشان نمی‌دهیم.
           */
          console.warn(
            "HEADER_BACKGROUND_LOAD_ERROR",
            error
          );
        }
      };


    loadBackground();


    return () => {
      controller.abort();
    };
  }, []);


  return (
    <header
    className="header"
    style={
      backgroundImage
        ? {
            backgroundImage: `url(${backgroundImage})`,
          }
        : undefined
    }
  >
    <div className="header-overlay" />

    <div className="logo-container">
      <div className="header-text">
        <h1 className="site-title-main">
          هیئت تکواندو
        </h1>

        <h2 className="site-title-sub">
          استان چهارمحال و بختیاری
        </h2>
      </div>

      <img
        src={logo}
        alt="Logo"
        className="logo"
      />
    </div>
  </header>
);
};


export default Header;