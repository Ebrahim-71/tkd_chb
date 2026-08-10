// src/api/apiClient.js

import {
  showGlobalError,
} from "../services/globalMessage";


function getStatusTitle(status) {
  switch (Number(status)) {
    case 400:
      return "اطلاعات نامعتبر";

    case 401:
      return "نیاز به ورود";

    case 403:
      return "عدم دسترسی";

    case 404:
      return "یافت نشد";

    case 409:
      return "اطلاعات تکراری";

    case 422:
      return "خطا در اطلاعات";

    case 429:
      return "تعداد درخواست زیاد";

    case 500:
    case 502:
    case 503:
    case 504:
      return "خطای سرور";

    default:
      return "خطا";
  }
}


function getStatusMessage(status) {
  switch (Number(status)) {
    case 400:
      return "اطلاعات ارسال‌شده معتبر نیست.";

    case 401:
      return "برای انجام این عملیات باید وارد حساب کاربری شوید.";

    case 403:
      return "شما اجازه انجام این عملیات را ندارید.";

    case 404:
      return "اطلاعات موردنظر پیدا نشد.";

    case 409:
      return "این اطلاعات قبلاً ثبت شده است.";

    case 422:
      return "برخی اطلاعات واردشده معتبر نیست.";

    case 429:
      return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";

    case 500:
    case 502:
    case 503:
    case 504:
      return "خطایی در سرور رخ داده است. دوباره تلاش کنید.";

    default:
      return "خطایی در انجام عملیات رخ داده است.";
  }
}


async function readErrorData(
  response
) {
  if (!response) {
    return null;
  }

  try {
    const cloned =
      response.clone();

    const contentType =
      cloned.headers.get(
        "content-type"
      ) || "";

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      return await cloned.json();
    }

    const text =
      await cloned.text();

    if (!text) {
      return null;
    }

    // اگر سرور صفحه HTML خطا برگرداند،
    // کل HTML را داخل Modal نشان نده.
    if (
      /<html|<!doctype/i.test(
        text
      )
    ) {
      return null;
    }

    return {
      detail: text,
    };
  } catch {
    return null;
  }
}


function createResponseError(
  response,
  data
) {
  const fallbackMessage =
    getStatusMessage(
      response?.status
    );

  const error =
    new Error(
      fallbackMessage
    );

  error.name = "ApiError";

  error.status =
    response?.status;

  error.response = {
    status:
      response?.status,

    data:
      data || {
        detail:
          fallbackMessage,
      },
  };

  return error;
}


/**
 * fetch سراسری پروژه CHBTKD
 *
 * گزینه‌های اضافی:
 *
 * globalError: false
 *   خطا را در Modal نشان نده.
 *   برای درخواست‌های probe/fallback مناسب است.
 *
 * errorTitle:
 *   عنوان دلخواه Modal.
 *
 * مثال:
 *
 * apiFetch(url, {
 *   method: "POST",
 *   globalError: true,
 *   errorTitle: "ثبت‌نام مسابقه",
 * })
 */
export async function apiFetch(
  url,
  options = {}
) {
  const {
    globalError = true,
    errorTitle = "",
    ...fetchOptions
  } = options || {};

  try {
    const response =
      await window.fetch(
        url,
        fetchOptions
      );

    if (
      !response.ok &&
      globalError
    ) {
      const data =
        await readErrorData(
          response
        );

      const error =
        createResponseError(
          response,
          data
        );

      showGlobalError(
        error,
        {
          title:
            errorTitle ||
            getStatusTitle(
              response.status
            ),
        }
      );
    }

    // عمداً Response اصلی را برمی‌گردانیم.
    // بنابراین کدهای قدیمی که:
    //
    // if (!res.ok) ...
    //
    // دارند، خراب نمی‌شوند.
    return response;

  } catch (originalError) {
    // Abort کاربر خطا محسوب نشود.
    if (
      originalError?.name ===
      "AbortError"
    ) {
      throw originalError;
    }

    if (globalError) {
      const networkError =
        new Error(
          "ارتباط با سرور برقرار نشد. اتصال اینترنت یا وضعیت سرور را بررسی کنید."
        );

      networkError.name =
        "NetworkError";

      networkError.originalError =
        originalError;

      showGlobalError(
        networkError,
        {
          title:
            errorTitle ||
            "خطا در ارتباط با سرور",
        }
      );
    }

    throw originalError;
  }
}


/**
 * برای درخواست‌هایی که خطای آنها
 * نباید Modal ایجاد کند.
 *
 * مثل URLهای fallback یا probe.
 */
export function apiFetchSilent(
  url,
  options = {}
) {
  return apiFetch(
    url,
    {
      ...options,
      globalError: false,
    }
  );
}