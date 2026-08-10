// src/components/common/GlobalMessageModal/GlobalMessageModal.jsx

import React, {
  useEffect,
  useState,
} from "react";

import {
  GLOBAL_MESSAGE_EVENT,
} from "../../../services/globalMessage";

import "./GlobalMessageModal.css";


const DEFAULT_TITLES = {
  error: "خطا",
  success: "عملیات موفق",
  warning: "هشدار",
  info: "اطلاع",
};


const ICONS = {
  error: "!",
  success: "✓",
  warning: "!",
  info: "i",
};


export default function GlobalMessageModal() {
  const [modal, setModal] = useState({
    open: false,
    type: "info",
    title: "",
    messages: [],
    closable: true,
    onClose: null,
    });


  useEffect(() => {
    const handleGlobalMessage = (
      event
    ) => {
      const detail =
        event?.detail || {};

      const type = [
        "error",
        "success",
        "warning",
        "info",
      ].includes(detail.type)
        ? detail.type
        : "info";

      const messages =
        Array.isArray(detail.messages)
          ? detail.messages
          : detail.messages
          ? [detail.messages]
          : [];

      setModal({
        open: true,
        type,
        title:
            detail.title ||
            DEFAULT_TITLES[type],
        messages:
            messages.length
            ? messages
            : [
                "پیامی برای نمایش وجود ندارد.",
                ],
        closable:
            detail.closable !== false,
        onClose:
            typeof detail.onClose === "function"
            ? detail.onClose
            : null,
        });
    };


    window.addEventListener(
      GLOBAL_MESSAGE_EVENT,
      handleGlobalMessage
    );


    return () => {
      window.removeEventListener(
        GLOBAL_MESSAGE_EVENT,
        handleGlobalMessage
      );
    };
  }, []);


  const closeModal = () => {
    if (!modal.closable) {
        return;
    }

    const onCloseCallback =
        modal.onClose;

    setModal((previous) => ({
        ...previous,
        open: false,
        onClose: null,
    }));

    if (
        typeof onCloseCallback ===
        "function"
    ) {
        onCloseCallback();
    }
    };

  // بستن با Escape
  useEffect(() => {
    if (!modal.open) {
      return undefined;
    }

    const handleKeyDown = (
      event
    ) => {
      if (
        event.key === "Escape" &&
        modal.closable
      ) {
        closeModal();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    modal.open,
    modal.closable,
  ]);


  if (!modal.open) {
    return null;
  }


  return (
    <div
      className="global-message-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closeModal();
        }
      }}
    >
      <div
        className={[
          "global-message-modal",
          `global-message-${modal.type}`,
        ].join(" ")}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-message-title"
      >
        {modal.closable && (
          <button
            type="button"
            className="global-message-close"
            onClick={closeModal}
            aria-label="بستن"
            title="بستن"
          >
            ×
          </button>
        )}


        <div
          className="global-message-icon"
          aria-hidden="true"
        >
          {ICONS[modal.type]}
        </div>


        <h3
          id="global-message-title"
          className="global-message-title"
        >
          {modal.title}
        </h3>


        <div className="global-message-content">
          {modal.messages.length === 1 ? (
            <p>
              {modal.messages[0]}
            </p>
          ) : (
            <ul>
              {modal.messages.map(
                (message, index) => (
                  <li
                    key={`${index}-${message}`}
                  >
                    {message}
                  </li>
                )
              )}
            </ul>
          )}
        </div>


        {modal.closable && (
          <button
            type="button"
            className="global-message-action"
            onClick={closeModal}
          >
            متوجه شدم
          </button>
        )}
      </div>
    </div>
  );
}