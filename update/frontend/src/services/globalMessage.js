// src/services/globalMessage.js

export const GLOBAL_MESSAGE_EVENT =
  "chbtkd-global-message";


/* =========================================================
   Collect messages recursively
========================================================= */

function collectMessages(
  value,
  output = []
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return output;
  }


  if (
    typeof value === "string"
  ) {
    const text =
      value.trim();


    if (text) {
      output.push(
        text
      );
    }


    return output;
  }


  /*
   * عدد و boolean معمولاً پیام قابل نمایش نیستند.
   */
  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return output;
  }


  if (
    Array.isArray(value)
  ) {
    value.forEach(
      (item) => {
        collectMessages(
          item,
          output
        );
      }
    );


    return output;
  }


  if (
    typeof value === "object"
  ) {
    Object.values(
      value
    ).forEach(
      (item) => {
        collectMessages(
          item,
          output
        );
      }
    );
  }


  return output;
}


/* =========================================================
   Extract API messages
========================================================= */

export function extractApiMessages(
  error
) {
  const messages = [];


  if (!error) {
    return [
      "خطای نامشخصی رخ داده است.",
    ];
  }


  /*
   * ترتیب مهم است:
   *
   * Axios:
   * error.response.data
   *
   * competitions.js:
   * error.payload
   *
   * سایر helperها:
   * error.data / error.body
   */
  const data =
    error?.response?.data ||
    error?.payload ||
    error?.data ||
    error?.body ||
    null;


  if (data) {
    /*
     * اگر کل پاسخ string بود.
     */
    if (
      typeof data ===
      "string"
    ) {
      collectMessages(
        data,
        messages
      );

    } else if (
      typeof data ===
      "object"
    ) {
      /*
       * کلیدهای رایج DRF / backend
       */
      const preferredKeys = [
        "detail",
        "message",
        "error",
        "errors",
        "non_field_errors",
        "__all__",
        "discount_code",
        "raw",
      ];


      preferredKeys.forEach(
        (key) => {
          if (
            data?.[key] !==
            undefined
          ) {
            collectMessages(
              data[key],
              messages
            );
          }
        }
      );


      /*
       * خطاهای Serializer مثل:
       *
       * email
       * national_code
       * insurance_number
       * team_1
       * team_2
       * coach_code
       * ...
       */
      Object.entries(
        data
      ).forEach(
        ([
          key,
          value,
        ]) => {
          if (
            preferredKeys.includes(
              key
            )
          ) {
            return;
          }


          collectMessages(
            value,
            messages
          );
        }
      );
    }
  }


  /*
   * اگر payload پیام نداشت
   * از Error.message استفاده کن.
   */
  if (
    messages.length === 0 &&
    error?.message
  ) {
    collectMessages(
      error.message,
      messages
    );
  }


  /*
   * حذف پیام‌های تکراری
   */
  const uniqueMessages = [
    ...new Set(
      messages
        .map(
          (message) =>
            String(
              message ||
              ""
            ).trim()
        )
        .filter(Boolean)
    ),
  ];


  if (
    !uniqueMessages.length
  ) {
    return [
      "خطایی در انجام عملیات رخ داده است.",
    ];
  }


  return uniqueMessages;
}


/* =========================================================
   Base global message
========================================================= */

export function showGlobalMessage({
  type = "info",
  title = "",
  message = "",
  messages = [],
  closable = true,
  onClose = null,
} = {}) {
  let finalMessages = [];


  if (
    Array.isArray(
      messages
    ) &&
    messages.length
  ) {
    finalMessages =
      messages;

  } else if (message) {
    finalMessages = [
      message,
    ];
  }


  finalMessages =
    finalMessages
      .map(
        (item) =>
          String(
            item ||
            ""
          ).trim()
      )
      .filter(Boolean);


  /*
   * پروژه React در Browser اجرا می‌شود،
   * ولی این check مانع خطای احتمالی خارج Browser می‌شود.
   */
  if (
    typeof window ===
      "undefined"
  ) {
    return;
  }


  window.dispatchEvent(
    new CustomEvent(
      GLOBAL_MESSAGE_EVENT,
      {
        detail: {
          type,

          title,

          messages:
            finalMessages.length
              ? finalMessages
              : [
                  "پیامی برای نمایش وجود ندارد.",
                ],

          closable,

          onClose:
            typeof onClose ===
            "function"
              ? onClose
              : null,
        },
      }
    )
  );
}


/* =========================================================
   Error
========================================================= */

export function showGlobalError(
  error,
  options = {}
) {
  showGlobalMessage({
    type:
      "error",

    title:
      options.title ||
      "خطا",

    messages:
      extractApiMessages(
        error
      ),

    closable:
      options.closable !==
      false,

    onClose:
      typeof options.onClose ===
      "function"
        ? options.onClose
        : null,
  });
}


/* =========================================================
   Success
========================================================= */

export function showGlobalSuccess(
  message,
  title = "عملیات موفق",
  onClose = null
) {
  showGlobalMessage({
    type:
      "success",

    title,

    message,

    onClose,
  });
}


/* =========================================================
   Warning
========================================================= */

export function showGlobalWarning(
  message,
  title = "هشدار",
  onClose = null
) {
  showGlobalMessage({
    type:
      "warning",

    title,

    message,

    onClose,
  });
}


/* =========================================================
   Info
========================================================= */

export function showGlobalInfo(
  message,
  title = "اطلاع",
  onClose = null
) {
  showGlobalMessage({
    type:
      "info",

    title,

    message,

    onClose,
  });
}