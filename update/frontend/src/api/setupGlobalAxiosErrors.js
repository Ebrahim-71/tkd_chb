// src/api/setupGlobalAxiosErrors.js

import axios from "axios";

import {
  showGlobalError,
} from "../services/globalMessage";


let interceptorId = null;


function getAxiosErrorTitle(
  error
) {
  const status = Number(
    error?.response?.status || 0
  );

  switch (status) {
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


export function setupGlobalAxiosErrors() {
  // جلوگیری از نصب چندباره interceptor
  // در Hot Reload یا Renderهای مجدد
  if (interceptorId !== null) {
    return interceptorId;
  }


  interceptorId =
    axios.interceptors.response.use(
      (response) => {
        return response;
      },

      (error) => {
        // درخواست لغوشده خطای قابل نمایش نیست
        if (
          axios.isCancel(error) ||
          error?.code ===
            "ERR_CANCELED" ||
          error?.name ===
            "CanceledError"
        ) {
          return Promise.reject(
            error
          );
        }


        // برای APIهای خاص بعداً می‌توانیم بنویسیم:
        //
        // axios.get(url, {
        //   skipGlobalError: true
        // })
        //
        // تا Modal نمایش داده نشود.
        if (
          error?.config
            ?.skipGlobalError !==
          true
        ) {
          showGlobalError(
            error,
            {
              title:
                getAxiosErrorTitle(
                  error
                ),
            }
          );
        }


        // رفتار قبلی Axios حفظ می‌شود.
        // یعنی catch های موجود همچنان اجرا می‌شوند.
        return Promise.reject(
          error
        );
      }
    );


  return interceptorId;
}