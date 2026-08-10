// src/components/Login/competitions/CoachRegisterStudents.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useNavigate,
  useLocation,
} from "react-router-dom";

import {
  getEligibleStudentsForCoach,
  registerStudentsBulk,
  getCompetitionDetail,
  startPaymentIntent,
  startGroupPayment,
  submitGatewayForm,
} from "../../../api/competitions";

import {
  showGlobalMessage,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../services/globalMessage";

import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";

import "./CoachRegisterStudents.css";


/* ======================================================
   Constants
====================================================== */

const DEFAULT_GATEWAY =
  "sadad";


/* ======================================================
   Utils
====================================================== */

const toFa = (value) =>
  String(value ?? "").replace(
    /\d/g,
    (digit) =>
      "۰۱۲۳۴۵۶۷۸۹"[digit]
  );


const normalizeDigits = (
  value = ""
) =>
  String(value)
    .replace(
      /[۰-۹]/g,
      (digit) =>
        "0123456789"[
          "۰۱۲۳۴۵۶۷۸۹".indexOf(
            digit
          )
        ]
    )
    .replace(
      /[٠-٩]/g,
      (digit) =>
        "0123456789"[
          "٠١٢٣٤٥٦٧٨٩".indexOf(
            digit
          )
        ]
    );


const getId = (student) =>
  student?.id ??
  student?.player_id ??
  student?.user_id ??
  student?.profile_id;


/* ======================================================
   Error helpers

   competitions.js بعضی خطاها را با
   error.payload برمی‌گرداند.
====================================================== */

const getErrorStatus = (
  error
) =>
  error?.status ||
  error?.response?.status ||
  error?.payload?.status ||
  null;


const getErrorMessages = (
  error
) => {
  const data =
    error?.payload ||
    error?.response?.data ||
    error?.data ||
    error?.body ||
    null;


  const output = [];


  const add = (value) => {
    if (
      value === null ||
      value === undefined
    ) {
      return;
    }


    if (
      typeof value === "string"
    ) {
      const text =
        value.trim();

      if (
        text &&
        !output.includes(text)
      ) {
        output.push(text);
      }

      return;
    }


    if (
      Array.isArray(value)
    ) {
      value.forEach(add);
      return;
    }


    if (
      typeof value === "object"
    ) {
      Object.values(
        value
      ).forEach(add);
    }
  };


  if (
    typeof data === "string"
  ) {
    add(data);

  } else if (data) {
    add(data.detail);
    add(data.message);
    add(data.error);
    add(data.errors);
    add(data.non_field_errors);
    add(data.discount_code);
  }


  if (
    !output.length &&
    error?.message
  ) {
    add(error.message);
  }


  return output;
};


const showRequestError = (
  error,
  title,
  fallback
) => {
  const messages =
    getErrorMessages(error);


  showGlobalMessage({
    type: "error",
    title,
    message:
      messages.length
        ? messages
        : fallback,
  });
};


/* ======================================================
   Robust extractor: enrollment IDs
====================================================== */

const extractEnrollmentIds = (
  response
) => {
  if (!response) {
    return [];
  }


  if (
    Array.isArray(
      response.enrollment_ids
    )
  ) {
    return response.enrollment_ids
      .map(Number)
      .filter(
        (id) =>
          Number.isFinite(id) &&
          id > 0
      );
  }


  if (
    Array.isArray(
      response.enrollments
    )
  ) {
    return response.enrollments
      .map((item) =>
        typeof item ===
        "number"
          ? item
          : item?.enrollment_id ??
            item?.id ??
            item?.pk
      )
      .map(Number)
      .filter(
        (id) =>
          Number.isFinite(id) &&
          id > 0
      );
  }


  const output =
    new Set();


  const visit = (
    value,
    path = []
  ) => {
    if (!value) {
      return;
    }


    if (
      Array.isArray(value)
    ) {
      value.forEach(
        (item) =>
          visit(
            item,
            path
          )
      );

      return;
    }


    if (
      typeof value !==
      "object"
    ) {
      return;
    }


    const keys =
      Object.keys(value);


    const inEnrollmentPath =
      path.some((key) =>
        String(key)
          .toLowerCase()
          .includes("enroll")
      );


    if (
      "enrollment_id" in
      value
    ) {
      const id =
        Number(
          value.enrollment_id
        );

      if (
        Number.isFinite(id) &&
        id > 0
      ) {
        output.add(id);
      }
    }


    if (
      inEnrollmentPath &&
      (
        "id" in value ||
        "pk" in value
      )
    ) {
      const id =
        Number(
          value.id ??
          value.pk
        );

      if (
        Number.isFinite(id) &&
        id > 0
      ) {
        output.add(id);
      }
    }


    if (
      value.enrollment &&
      typeof value.enrollment ===
        "object"
    ) {
      const id =
        Number(
          value.enrollment
            .enrollment_id ??
          value.enrollment.id ??
          value.enrollment.pk
        );


      if (
        Number.isFinite(id) &&
        id > 0
      ) {
        output.add(id);
      }
    }


    for (
      const key
      of keys
    ) {
      visit(
        value[key],
        [
          ...path,
          key,
        ]
      );
    }
  };


  [
    "data",
    "result",
    "results",
    "payload",
    "created",
    "items",
  ].forEach((key) => {
    if (
      response[key] !==
      undefined
    ) {
      visit(
        response[key],
        [key]
      );
    }
  });


  visit(
    response,
    []
  );


  return Array.from(
    output
  );
};


/* ======================================================
   Jalali -> Gregorian ISO
====================================================== */

const jalaliToISO = (
  jalaliValue
) => {
  if (!jalaliValue) {
    return "";
  }


  try {
    const date =
      new DateObject({
        date:
          normalizeDigits(
            String(
              jalaliValue
            )
          ).replace(
            /-/g,
            "/"
          ),

        calendar:
          persian,

        locale:
          persian_fa,

        format:
          "YYYY/MM/DD",
      });


    if (!date?.isValid) {
      return "";
    }


    return date
      .convert(
        gregorian,
        gregorian_en
      )
      .format(
        "YYYY-MM-DD"
      );

  } catch {
    return "";
  }
};


/* ======================================================
   Component
====================================================== */

export default function CoachRegisterStudents() {
  const {
    role,
    slug,
  } = useParams();


  const navigate =
    useNavigate();


  const location =
    useLocation();


  const [
    discountApplied,
    setDiscountApplied,
  ] = useState(false);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);


  const [
    comp,
    setComp,
  ] = useState(null);


  const [
    students,
    setStudents,
  ] = useState([]);


  const [
    sel,
    setSel,
  ] = useState({});


  const [
    confirmOpen,
    setConfirmOpen,
  ] = useState(false);


  const [
    compStyle,
    setCompStyle,
  ] = useState(
    "kyorugi"
  );


  /* ====================================================
     Discount
  ==================================================== */

  const [
    hasDiscount,
    setHasDiscount,
  ] = useState(false);


  const [
    discountCode,
    setDiscountCode,
  ] = useState("");


  const [
    discountLoading,
    setDiscountLoading,
  ] = useState(false);


  const [
    finalAmount,
    setFinalAmount,
  ] = useState(0);


  const [
    discountAmount,
    setDiscountAmount,
  ] = useState(0);


  const [
    originalAmount,
    setOriginalAmount,
  ] = useState(0);


  /* ====================================================
     Student map
  ==================================================== */

  const studentById =
    useMemo(() => {
      const map =
        new Map();


      for (
        const student
        of students
      ) {
        const id =
          getId(student);


        if (id != null) {
          map.set(
            Number(id),
            student
          );
        }
      }


      return map;

    }, [students]);


  /* ====================================================
     Grouped students for Poomsae
  ==================================================== */

  const groupedStudentRows =
    useMemo(() => {
      if (
        compStyle !==
        "poomsae"
      ) {
        return students.map(
          (student) => ({
            type:
              "student",
            student,
          })
        );
      }


      const groups =
        new Map();


      students.forEach(
        (student) => {
          const categoryId =
            student
              .age_category_id ??
            student
              .age_group_id ??
            student
              .age_category_key ??
            "unknown";


          const categoryName =
            student
              .age_category_name ||
            student
              .age_group_name ||
            "رده سنی نامشخص";


          const categoryOrder =
            Number(
              student
                .age_category_order ??
              999999
            );


          const key =
            String(
              categoryId
            );


          if (
            !groups.has(key)
          ) {
            groups.set(
              key,
              {
                key,

                label:
                  categoryName,

                order:
                  Number.isFinite(
                    categoryOrder
                  )
                    ? categoryOrder
                    : 999999,

                students: [],
              }
            );
          }


          groups
            .get(key)
            .students
            .push(student);
        }
      );


      return Array.from(
        groups.values()
      )
        .sort(
          (a, b) => {
            if (
              a.order !==
              b.order
            ) {
              return (
                a.order -
                b.order
              );
            }


            return String(
              a.label
            ).localeCompare(
              String(
                b.label
              ),
              "fa"
            );
          }
        )
        .flatMap(
          (group) => [
            {
              type:
                "group",

              key:
                `group-${group.key}`,

              label:
                group.label,

              count:
                group.students
                  .length,
            },

            ...[
              ...group.students,
            ]
              .sort(
                (a, b) => {
                  const nameA =
                    `${a.first_name || ""} ${a.last_name || ""}`.trim();

                  const nameB =
                    `${b.first_name || ""} ${b.last_name || ""}`.trim();


                  return nameA.localeCompare(
                    nameB,
                    "fa"
                  );
                }
              )
              .map(
                (student) => ({
                  type:
                    "student",

                  student,
                })
              ),
          ]
        );

    }, [
      students,
      compStyle,
    ]);


  /* ====================================================
     Style detection
  ==================================================== */

  const detectStyleFromContext = (
    competition
  ) => {
    const fromState =
      location?.state?.style;


    if (fromState) {
      return String(
        fromState
      ).toLowerCase();
    }


    const query =
      new URLSearchParams(
        location?.search ||
        ""
      );


    const fromQuery =
      query.get(
        "style"
      );


    if (fromQuery) {
      return String(
        fromQuery
      ).toLowerCase();
    }


    const path =
      (
        location?.pathname ||
        ""
      ).toLowerCase();


    if (
      path.includes(
        "/poomsae/"
      ) ||
      path.includes(
        "poomsae"
      )
    ) {
      return "poomsae";
    }


    if (
      path.includes(
        "/kyorugi/"
      ) ||
      path.includes(
        "kyorugi"
      )
    ) {
      return "kyorugi";
    }


    if (
      competition?.kind ===
        "poomsae" ||
      competition?.style ===
        "poomsae" ||
      competition?.style_key ===
        "poomsae"
    ) {
      return "poomsae";
    }


    if (
      competition
        ?.style_display &&
      String(
        competition
          .style_display
      ).includes(
        "پومسه"
      )
    ) {
      return "poomsae";
    }


    return "kyorugi";
  };


  const detectStyleFast =
    () => {
      const fromState =
        location?.state
          ?.style;


      if (fromState) {
        return String(
          fromState
        ).toLowerCase();
      }


      const query =
        new URLSearchParams(
          location?.search ||
          ""
        );


      const fromQuery =
        query.get(
          "style"
        );


      if (fromQuery) {
        return String(
          fromQuery
        ).toLowerCase();
      }


      const path =
        (
          location
            ?.pathname ||
          ""
        ).toLowerCase();


      if (
        path.includes(
          "/poomsae/"
        ) ||
        path.includes(
          "poomsae"
        )
      ) {
        return "poomsae";
      }


      return "kyorugi";
    };


  /* ====================================================
     Unauthorized
  ==================================================== */

  const handleUnauthorized =
    () => {
      const currentRole =
        (
          localStorage.getItem(
            "user_role"
          ) ||
          role ||
          ""
        )
          .toLowerCase()
          .trim();


      if (currentRole) {
        localStorage.removeItem(
          `${currentRole}_token`
        );
      }


      localStorage.removeItem(
        "access_token"
      );

      localStorage.removeItem(
        "user_role"
      );


      showGlobalMessage({
        type:
          "warning",

        title:
          "پایان اعتبار ورود",

        message:
          "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",

        onClose: () => {
          navigate("/");
        },
      });
    };


  /* ====================================================
     اگر eligible وزن‌ها را نداد
  ==================================================== */

  const fillCompetitionIfMissingWeights =
    async (
      competitionData,
      competitionSlug
    ) => {
      const hasWeights =
        (
          Array.isArray(
            competitionData
              ?.mat_assignments
          ) &&
          competitionData
            .mat_assignments
            .some(
              (mat) =>
                Array.isArray(
                  mat?.weights
                ) &&
                mat.weights.length
            )
        ) ||
        (
          Array.isArray(
            competitionData
              ?.matAssignments
          ) &&
          competitionData
            .matAssignments
            .some(
              (mat) =>
                Array.isArray(
                  mat?.weights
                ) &&
                mat.weights.length
            )
        ) ||
        (
          Array.isArray(
            competitionData
              ?.weight_categories
          ) &&
          competitionData
            .weight_categories
            .length
        ) ||
        (
          Array.isArray(
            competitionData
              ?.weightCategories
          ) &&
          competitionData
            .weightCategories
            .length
        );


      if (hasWeights) {
        return competitionData;
      }


      const detail =
        await getCompetitionDetail(
          competitionSlug
        );


      return (
        detail ||
        competitionData
      );
    };


  /* ====================================================
     Initial load
  ==================================================== */

  useEffect(() => {
    let alive = true;


    const load =
      async () => {
        setLoading(true);
        setLoadFailed(false);


        const fastStyle =
          detectStyleFast();


        setCompStyle(
          fastStyle
        );


        try {
          const response =
            await getEligibleStudentsForCoach(
              slug,
              fastStyle
            );


          if (!alive) {
            return;
          }


          const competitionData =
            response?.competition ||
            null;


          const list =
            Array.isArray(
              response?.students
            )
              ? response.students
              : [];


          const competitionFull =
            await fillCompetitionIfMissingWeights(
              competitionData,
              slug
            );


          if (!alive) {
            return;
          }


          setComp(
            competitionFull
          );


          setStudents(
            list
          );


          const style =
            response?.__style ||
            detectStyleFromContext(
              competitionFull
            ) ||
            fastStyle;


          setCompStyle(
            style
          );


          const initialSelection =
            {};


          for (
            const student
            of list
          ) {
            const id =
              getId(student);


            if (id == null) {
              continue;
            }


            if (
              student
                .already_enrolled
            ) {
              initialSelection[id] =
                {
                  checked: true,
                  locked: true,

                  weight_category_id:
                    "",

                  poomsae_type:
                    "",

                  ins: "",

                  ins_date:
                    "",

                  errors: {},
                };
            }
          }


          setSel(
            initialSelection
          );

        } catch (error) {
          if (!alive) {
            return;
          }


          console.error(
            "COACH_STUDENTS_LOAD_ERROR",
            error
          );


          setLoadFailed(
            true
          );


          if (
            getErrorStatus(
              error
            ) === 401
          ) {
            handleUnauthorized();
            return;
          }


          showRequestError(
            error,
            "خطا در دریافت شاگردان واجد شرایط",
            "لیست شاگردان واجد شرایط دریافت نشد."
          );

        } finally {
          if (alive) {
            setLoading(false);
          }
        }
      };


    load();


    return () => {
      alive = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slug,
    location?.state,
    location?.search,
  ]);


  /* ====================================================
     Fee
  ==================================================== */

  const entryFee =
    Number(
      comp?.entry_fee_rial ??
      comp?.entry_fee ??
      0
    );


  /* ====================================================
     Weight categories
  ==================================================== */

  const weightCategories =
    useMemo(() => {
      const direct =
        comp?.weight_categories ||
        comp?.weightCategories ||
        comp?.weights ||
        comp?.weight_options;


      if (
        Array.isArray(
          direct
        ) &&
        direct.length
      ) {
        return direct;
      }


      const mats =
        (
          Array.isArray(
            comp?.mat_assignments
          )
            ? comp
                .mat_assignments
            : null
        ) ||
        (
          Array.isArray(
            comp?.matAssignments
          )
            ? comp
                .matAssignments
            : []
        );


      const flat =
        mats.flatMap(
          (mat) => {
            const weights =
              mat?.weights ||
              mat
                ?.weight_categories ||
              mat
                ?.weightCategories ||
              mat
                ?.weight_options;


            return Array.isArray(
              weights
            )
              ? weights
              : [];
          }
        );


      const map =
        new Map();


      for (
        const weight
        of flat
      ) {
        const id =
          weight?.id ??
          `${weight?.name}-${weight?.min_weight}-${weight?.max_weight}`;


        if (
          id != null &&
          !map.has(id)
        ) {
          map.set(
            id,
            weight
          );
        }
      }


      return Array.from(
        map.values()
      ).sort(
        (a, b) =>
          Number(
            a?.min_weight ??
            a?.min ??
            0
          ) -
          Number(
            b?.min_weight ??
            b?.min ??
            0
          )
      );

    }, [comp]);


  /* ====================================================
     Selected
  ==================================================== */

  const selectedNewIds =
    useMemo(() => {
      const output = [];


      for (
        const student
        of students
      ) {
        const id =
          getId(student);


        if (id == null) {
          continue;
        }


        const row =
          sel[id];


        if (
          row?.checked &&
          !row?.locked &&
          !student
            .already_enrolled
        ) {
          output.push(id);
        }
      }


      return output;

    }, [
      sel,
      students,
    ]);


  const totalAmount =
    entryFee *
    selectedNewIds.length;


  /* ====================================================
     Reset amount when selection changes
  ==================================================== */

  useEffect(() => {
    if (
      discountApplied
    ) {
      return;
    }


    setOriginalAmount(
      totalAmount
    );

    setDiscountAmount(0);

    setFinalAmount(
      totalAmount
    );

  }, [
    totalAmount,
    discountApplied,
  ]);


  const invalidateDiscount =
    () => {
      if (
        discountApplied
      ) {
        setDiscountApplied(
          false
        );
      }


      if (
        discountAmount !==
        0
      ) {
        setDiscountAmount(
          0
        );
      }


      if (
        finalAmount !==
        totalAmount
      ) {
        setFinalAmount(
          totalAmount
        );
      }


      if (
        originalAmount !==
        totalAmount
      ) {
        setOriginalAmount(
          totalAmount
        );
      }
    };


  /* ====================================================
     Selection helpers
  ==================================================== */

  const updateRow = (
    id,
    patch
  ) => {
    invalidateDiscount();


    setSel(
      (previous) => ({
        ...previous,

        [id]: {
          ...(
            previous[id] ||
            {
              checked: true,
              locked: false,

              weight_category_id:
                "",

              poomsae_type:
                "",

              ins: "",

              ins_date:
                "",

              errors: {},
            }
          ),

          ...patch,
        },
      })
    );
  };


  const toggle = (
    id,
    checked
  ) => {
    if (
      sel[id]?.locked
    ) {
      return;
    }


    invalidateDiscount();


    if (!checked) {
      setSel(
        (previous) => ({
          ...previous,

          [id]: {
            checked: false,
            locked: false,

            weight_category_id:
              "",

            poomsae_type:
              "",

            ins: "",

            ins_date:
              "",

            errors: {},
          },
        })
      );

      return;
    }


    updateRow(
      id,
      {
        checked: true,
      }
    );
  };


  /* ====================================================
     Validation

     مهم:
     این تابع دیگر updateRow را صدا نمی‌زند.
     در نتیجه صرف Validation باعث باطل شدن
     کد تخفیف اعمال‌شده نمی‌شود.
  ==================================================== */

  const validateRow = (
    id
  ) => {
    const row =
      sel[id] || {};


    const errors = {};


    if (
      compStyle ===
      "kyorugi"
    ) {
      if (
        !row
          .weight_category_id
      ) {
        errors.weight_category_id =
          "انتخاب رده وزنی الزامی است.";
      }

    } else if (
      compStyle ===
      "poomsae"
    ) {
      if (
        !row.poomsae_type
      ) {
        errors.poomsae_type =
          "انتخاب سبک پومسه الزامی است.";
      }
    }


    if (!row.ins) {
      errors.ins =
        "شماره بیمه الزامی است.";
    }


    if (!row.ins_date) {
      errors.ins_date =
        "تاریخ صدور بیمه الزامی است.";
    }


    setSel(
      (previous) => ({
        ...previous,

        [id]: {
          ...(previous[id] ||
            {}),

          errors,
        },
      })
    );


    return (
      Object.keys(
        errors
      ).length === 0
    );
  };


  const validateSelectedRows =
    () => {
      let valid = true;


      for (
        const id
        of selectedNewIds
      ) {
        if (
          !validateRow(id)
        ) {
          valid = false;
        }
      }


      if (!valid) {
        showGlobalWarning(
          "اطلاعات ثبت‌نام همه شاگردان انتخاب‌شده را کامل کنید. موارد ناقص در فرم مشخص شده‌اند.",
          "اطلاعات ثبت‌نام ناقص است"
        );
      }


      return valid;
    };


  const onChangeWeightCategory = (
    id,
    value
  ) =>
    updateRow(
      id,
      {
        weight_category_id:
          value,
      }
    );


  const onChangeIns = (
    id,
    value
  ) =>
    updateRow(
      id,
      {
        ins:
          normalizeDigits(
            value
          ),
      }
    );


  const onChangeInsDate = (
    id,
    value
  ) =>
    updateRow(
      id,
      {
        ins_date:
          value
            ? normalizeDigits(
                value.format(
                  "YYYY/MM/DD"
                )
              )
            : "",
      }
    );


  const onChangePoomsaeType = (
    id,
    value
  ) =>
    updateRow(
      id,
      {
        poomsae_type:
          value,
      }
    );


  /* ====================================================
     Payload
  ==================================================== */

  const buildStudentsPayload =
    () => {
      const payload =
        selectedNewIds.map(
          (id) => {
            const row =
              sel[id];


            const student =
              studentById.get(
                Number(id)
              );


            const issueISO =
              jalaliToISO(
                row.ins_date
              );


            return {
              player_id:
                Number(id),

              insurance_number:
                row.ins,

              insurance_issue_date:
                issueISO ||
                "",

              board_id:
                student?.board_id ??
                student?.board ??
                student?.boardId ??
                undefined,

              ...(compStyle ===
              "kyorugi"
                ? {
                    weight_category_id:
                      Number(
                        row.weight_category_id
                      ),
                  }
                : {}),

              ...(compStyle ===
              "poomsae"
                ? {
                    poomsae_type:
                      row.poomsae_type,
                  }
                : {}),
            };
          }
        );


      for (
        const item
        of payload
      ) {
        if (
          !item
            .insurance_issue_date
        ) {
          throw new Error(
            "تاریخ صدور بیمه نامعتبر است. لطفاً دوباره انتخاب کنید."
          );
        }
      }


      return payload;
    };


  /* ====================================================
     Discount
  ==================================================== */

  const handleApplyDiscount =
    async () => {
      setDiscountApplied(
        false
      );


      if (!hasDiscount) {
        setDiscountCode(
          ""
        );

        setDiscountAmount(
          0
        );

        setFinalAmount(
          totalAmount
        );

        setOriginalAmount(
          totalAmount
        );

        return;
      }


      if (
        !discountCode.trim()
      ) {
        showGlobalWarning(
          "کد تخفیف را وارد کنید.",
          "کد تخفیف وارد نشده است"
        );

        return;
      }


      if (!totalAmount) {
        showGlobalWarning(
          "ابتدا حداقل یک شاگرد جدید را برای ثبت‌نام انتخاب کنید.",
          "شاگردی انتخاب نشده است"
        );

        return;
      }


      if (
        !validateSelectedRows()
      ) {
        return;
      }


      try {
        setDiscountLoading(
          true
        );


        const studentsPayload =
          buildStudentsPayload();


        const data =
          await registerStudentsBulk(
            slug,
            {
              students:
                studentsPayload,

              person_count:
                studentsPayload
                  .length,

              discount_code:
                discountCode.trim(),

              gateway:
                DEFAULT_GATEWAY,

              preview: true,
            },
            compStyle
          );


        const initialAmount =
          Number.isFinite(
            Number(
              totalAmount
            )
          )
            ? Number(
                totalAmount
              )
            : 0;


        let payableAmount =
          data?.amount_irr !=
          null
            ? Number(
                data.amount_irr
              )
            : NaN;


        if (
          !Number.isFinite(
            payableAmount
          )
        ) {
          const amountToman =
            data?.amount_toman !=
            null
              ? Number(
                  data.amount_toman
                )
              : NaN;


          if (
            Number.isFinite(
              amountToman
            )
          ) {
            payableAmount =
              amountToman *
              10;
          }
        }


        if (
          !Number.isFinite(
            payableAmount
          )
        ) {
          payableAmount =
            Number(
              data?.amount_rial ??
              data
                ?.final_amount_rial ??
              data
                ?.final_amount ??
              data?.amount ??
              initialAmount
            );
        }


        const discountValue =
          Number.isFinite(
            Number(
              data
                ?.discount_amount_irr
            )
          )
            ? Number(
                data
                  .discount_amount_irr
              )

            : Number.isFinite(
                Number(
                  data
                    ?.discount_amount_rial
                )
              )
            ? Number(
                data
                  .discount_amount_rial
              )

            : Math.max(
                0,
                initialAmount -
                  (
                    Number.isFinite(
                      payableAmount
                    )
                      ? payableAmount
                      : initialAmount
                  )
              );


        setOriginalAmount(
          initialAmount
        );


        setFinalAmount(
          Number.isFinite(
            payableAmount
          )
            ? payableAmount
            : initialAmount
        );


        setDiscountAmount(
          Number.isFinite(
            discountValue
          )
            ? discountValue
            : 0
        );


        setDiscountApplied(
          true
        );


        showGlobalSuccess(
          "کد تخفیف با موفقیت بررسی و روی مبلغ ثبت‌نام اعمال شد.",
          "کد تخفیف اعمال شد"
        );

      } catch (error) {
        console.error(
          "COACH_BULK_DISCOUNT_ERROR",
          error
        );


        setDiscountAmount(
          0
        );

        setFinalAmount(
          totalAmount
        );

        setOriginalAmount(
          totalAmount
        );

        setDiscountApplied(
          false
        );


        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          handleUnauthorized();
          return;
        }


        showRequestError(
          error,
          "کد تخفیف اعمال نشد",
          "امکان اعمال کد تخفیف وجود ندارد."
        );

      } finally {
        setDiscountLoading(
          false
        );
      }
    };


  /* ====================================================
     Submit
  ==================================================== */

  const submit =
    async () => {
      if (
        !selectedNewIds.length
      ) {
        showGlobalWarning(
          "حداقل یک شاگرد جدید را برای ثبت‌نام انتخاب کنید.",
          "شاگردی انتخاب نشده است"
        );

        setConfirmOpen(
          false
        );

        return;
      }


      if (
        !validateSelectedRows()
      ) {
        setConfirmOpen(
          false
        );

        return;
      }


      if (
        hasDiscount &&
        discountCode.trim() &&
        !discountApplied
      ) {
        showGlobalWarning(
          "کد تخفیف هنوز اعمال نشده است. ابتدا روی دکمه «اعمال» بزنید تا مبلغ نهایی محاسبه شود.",
          "کد تخفیف بررسی نشده است"
        );

        setConfirmOpen(
          false
        );

        return;
      }


      try {
        setLoading(true);


        const studentsPayload =
          buildStudentsPayload();


        const response =
          await registerStudentsBulk(
            slug,
            {
              students:
                studentsPayload,

              person_count:
                studentsPayload
                  .length,

              discount_code:
                hasDiscount
                  ? discountCode
                      .trim()
                  : "",

              gateway:
                DEFAULT_GATEWAY,

              preview: false,
            },
            compStyle
          );


        /* =============================================
           Backend مستقیماً payment برگردانده
        ============================================= */

        if (
          response
            ?.payment?.url
        ) {
          localStorage.setItem(
            "last_payment_kind",
            String(
              compStyle ||
              "kyorugi"
            )
          );


          localStorage.setItem(
            "last_payment_comp",
            String(
              slug ||
              comp?.public_id ||
              ""
            )
          );


          submitGatewayForm(
            response.payment
          );

          return;
        }


        /* =============================================
           Payment required
        ============================================= */

        if (
          response
            ?.payment_required
        ) {
          /* -----------------------------------------
             PaymentIntent
          ----------------------------------------- */

          if (
            response
              ?.payment_intent_public_id
          ) {
            const pid =
              response
                .payment_intent_public_id;


            const paymentResult =
              await startPaymentIntent(
                pid,
                {
                  gateway:
                    DEFAULT_GATEWAY,
                }
              );


            if (
              paymentResult
                ?.payment?.url
            ) {
              localStorage.setItem(
                "last_payment_kind",
                String(
                  compStyle ||
                  "kyorugi"
                )
              );


              localStorage.setItem(
                "last_payment_comp",
                String(
                  slug ||
                  comp
                    ?.public_id ||
                  ""
                )
              );


              localStorage.setItem(
                "last_payment_intent",
                String(pid)
              );


              submitGatewayForm(
                paymentResult.payment
              );

              return;
            }


            throw new Error(
              "پاسخ شروع پرداخت معتبر نیست و اطلاعات درگاه بانکی دریافت نشد."
            );
          }


          /* -----------------------------------------
             Group payment
          ----------------------------------------- */

          if (
            response
              ?.group_payment_id
          ) {
            const paymentResult =
              await startGroupPayment(
                response
                  .group_payment_id,
                {
                  gateway:
                    DEFAULT_GATEWAY,
                }
              );


            if (
              paymentResult
                ?.payment?.url
            ) {
              localStorage.setItem(
                "last_payment_kind",
                String(
                  compStyle ||
                  "kyorugi"
                )
              );


              localStorage.setItem(
                "last_payment_comp",
                String(
                  slug ||
                  comp
                    ?.public_id ||
                  ""
                )
              );


              localStorage.setItem(
                "last_group_payment_id",
                String(
                  response
                    .group_payment_id
                )
              );


              submitGatewayForm(
                paymentResult.payment
              );

              return;
            }


            throw new Error(
              "پاسخ شروع پرداخت گروهی معتبر نیست و اطلاعات درگاه بانکی دریافت نشد."
            );
          }


          throw new Error(
            "پرداخت برای این ثبت‌نام الزامی است، اما شناسه پرداخت از سرور دریافت نشد."
          );
        }


        /* =============================================
           ثبت‌نام بدون پرداخت
        ============================================= */

        const enrollmentIds =
          extractEnrollmentIds(
            response
          );


        if (
          !enrollmentIds.length
        ) {
          throw new Error(
            "ثبت‌نام انجام شد، اما شناسه ثبت‌نام‌ها از سرور دریافت نشد."
          );
        }


        const kindSafe =
          compStyle ||
          "kyorugi";


        showGlobalSuccess(
          `${toFa(
            enrollmentIds.length
          )} ثبت‌نام با موفقیت انجام شد.`,
          "ثبت‌نام موفق"
        );


        navigate(
          `/dashboard/${encodeURIComponent(
            role
          )}/enrollments/bulk?ids=${encodeURIComponent(
            enrollmentIds.join(
              ","
            )
          )}&kind=${encodeURIComponent(
            kindSafe
          )}`,
          {
            state: {
              ids:
                enrollmentIds,

              kind:
                kindSafe,
            },

            replace: true,
          }
        );

      } catch (error) {
        console.error(
          "COACH_BULK_REGISTER_ERROR",
          error
        );


        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          handleUnauthorized();
          return;
        }


        showRequestError(
          error,
          "خطا در ثبت‌نام یا پرداخت",
          "ثبت‌نام شاگردان انجام نشد. لطفاً دوباره تلاش کنید."
        );

      } finally {
        setLoading(false);
        setConfirmOpen(
          false
        );
      }
    };


  /* ====================================================
     Submit availability
  ==================================================== */

  const canSubmit =
    useMemo(() => {
      if (
        selectedNewIds
          .length === 0
      ) {
        return false;
      }


      for (
        const id
        of selectedNewIds
      ) {
        const row =
          sel[id] || {};


        const errors =
          row.errors || {};


        if (
          compStyle ===
          "kyorugi"
        ) {
          if (
            !row
              .weight_category_id
          ) {
            return false;
          }

        } else if (
          compStyle ===
          "poomsae"
        ) {
          if (
            !row
              .poomsae_type
          ) {
            return false;
          }
        }


        if (!row.ins) {
          return false;
        }


        if (
          !row.ins_date
        ) {
          return false;
        }


        if (
          Object.keys(
            errors
          ).length
        ) {
          return false;
        }
      }


      return true;

    }, [
      sel,
      selectedNewIds,
      compStyle,
    ]);


  /* ====================================================
     Loading / failure
  ==================================================== */

  if (
    loading &&
    !comp
  ) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">
          در حال بارگذاری…
        </div>
      </div>
    );
  }


  if (
    loadFailed &&
    !comp
  ) {
    return (
      <div
        className="cd-container"
        dir="rtl"
      >
        <div className="cd-muted">
          امکان دریافت اطلاعات ثبت‌نام این مسابقه وجود ندارد.
        </div>

        <div
          className="cd-actions"
          style={{
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-light"
            onClick={() =>
              navigate(-1)
            }
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }


  /* ====================================================
     Render
  ==================================================== */

  return (
    <div
      className="cd-container"
      dir="rtl"
    >

      <div className="cd-hero small">

        <div className="cd-hero-body">

          <h1 className="cd-title">
            ثبت‌نام شاگردان –{" "}
            {comp?.title ||
              "—"}
          </h1>


          <div className="cd-chips">

            {comp
              ?.gender_display && (
              <span className="cd-chip">
                {
                  comp
                    .gender_display
                }
              </span>
            )}


            {comp
              ?.age_category_name && (
              <span className="cd-chip">
                {
                  comp
                    .age_category_name
                }
              </span>
            )}


            {comp
              ?.belt_groups_display && (
              <span className="cd-chip">
                {
                  comp
                    .belt_groups_display
                }
              </span>
            )}


            <span className="cd-chip">
              هزینه ورودی:{" "}
              <strong>
                {toFa(
                  entryFee.toLocaleString()
                )}
              </strong>{" "}
              ریال
            </span>

          </div>
        </div>
      </div>


      {/* =================================================
          Students
      ================================================= */}

      <section className="cd-section">

        <h2 className="cd-section-title">
          شاگردهای واجد شرایط
        </h2>


        {students.length ===
        0 ? (
          <div className="cd-muted">
            شاگرد واجدشرایطی برای این مسابقه یافت نشد.
          </div>
        ) : (
          <div className="crs-table">

            <div className="crs-th">
              <div>
                انتخاب
              </div>

              <div>
                نام
              </div>

              <div>
                کد ملی
              </div>

              <div>
                تاریخ تولد
              </div>

              <div>
                کمربند
              </div>

              <div>
                باشگاه
              </div>

              <div>
                هیئت
              </div>
            </div>


            {groupedStudentRows.map(
              (item) => {
                if (
                  item.type ===
                  "group"
                ) {
                  return (
                    <div
                      key={
                        item.key
                      }
                      className="crs-age-group-row"
                    >
                      <strong>
                        {
                          item.label
                        }
                      </strong>

                      <span>
                        {toFa(
                          item.count
                        )}{" "}
                        بازیکن
                      </span>
                    </div>
                  );
                }


                const student =
                  item.student;


                const studentId =
                  getId(student);


                const row =
                  sel[
                    studentId
                  ] || {};


                const locked =
                  Boolean(
                    row.locked ||
                    student
                      .already_enrolled
                  );


                return (
                  <div
                    key={
                      studentId
                    }
                    className="crs-row"
                  >

                    <div className="crs-td">

                      <input
                        type="checkbox"
                        checked={
                          !!row.checked
                        }
                        disabled={
                          locked
                        }
                        onChange={(
                          event
                        ) =>
                          toggle(
                            studentId,
                            event
                              .target
                              .checked
                          )
                        }
                      />


                      {locked && (
                        <span
                          className="cd-chip"
                          style={{
                            marginRight:
                              -22,
                          }}
                        >
                          ثبت‌نام‌شده
                        </span>
                      )}

                    </div>


                    <div className="crs-td">
                      {student.first_name}{" "}
                      {student.last_name}
                    </div>


                    <div className="crs-td">
                      {student.national_code ||
                        "—"}
                    </div>


                    <div className="crs-td">
                      {student.birth_date ||
                        "—"}
                    </div>


                    <div className="crs-td">
                      {student.belt_grade ||
                        "—"}
                    </div>


                    <div className="crs-td">
                      {student.club_name ||
                        "—"}
                    </div>


                    <div className="crs-td">
                      {student.board_name ||
                        "—"}
                    </div>


                    {row.checked &&
                      !locked && (
                        <div className="crs-subrow">

                          {/* =================================
                              Kyorugi weight
                          ================================= */}

                          {compStyle ===
                          "kyorugi" ? (
                            <div className="cd-row">

                              <label className="cd-label">
                                رده وزنی
                              </label>


                              <div className="cd-value">

                                <select
                                  className="cd-input"
                                  value={
                                    row.weight_category_id ||
                                    ""
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    onChangeWeightCategory(
                                      studentId,
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  aria-invalid={
                                    !!row
                                      .errors
                                      ?.weight_category_id
                                  }
                                  disabled={
                                    !weightCategories.length
                                  }
                                >
                                  <option value="">
                                    {weightCategories.length
                                      ? "انتخاب کنید…"
                                      : "رده‌های وزنی این مسابقه تعریف نشده"}
                                  </option>


                                  {weightCategories.map(
                                    (
                                      category
                                    ) => (
                                      <option
                                        key={
                                          category.id
                                        }
                                        value={
                                          category.id
                                        }
                                      >
                                        {category.name ??
                                          category.title ??
                                          category.label ??
                                          `#${category.id}`}
                                      </option>
                                    )
                                  )}

                                </select>


                                {row
                                  .errors
                                  ?.weight_category_id && (
                                  <div
                                    className="cd-error"
                                    style={{
                                      marginTop:
                                        6,
                                    }}
                                  >
                                    {
                                      row
                                        .errors
                                        .weight_category_id
                                    }
                                  </div>
                                )}

                              </div>
                            </div>
                          ) : (
                            /* =================================
                               Poomsae type
                            ================================= */

                            <div className="cd-row">

                              <label className="cd-label">
                                سبک پومسه
                              </label>


                              <div className="cd-value">

                                <div className="cd-radio-group">

                                  <label className="cd-radio">

                                    <input
                                      type="radio"
                                      name={`poomsae-${studentId}`}
                                      value="standard"
                                      checked={
                                        row.poomsae_type ===
                                        "standard"
                                      }
                                      onChange={() =>
                                        onChangePoomsaeType(
                                          studentId,
                                          "standard"
                                        )
                                      }
                                    />

                                    <span>
                                      استاندارد
                                    </span>

                                  </label>


                                  <label
                                    className="cd-radio"
                                    style={{
                                      marginRight:
                                        16,
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name={`poomsae-${studentId}`}
                                      value="creative"
                                      checked={
                                        row.poomsae_type ===
                                        "creative"
                                      }
                                      onChange={() =>
                                        onChangePoomsaeType(
                                          studentId,
                                          "creative"
                                        )
                                      }
                                    />

                                    <span>
                                      ابداعی
                                    </span>
                                  </label>

                                </div>


                                {row
                                  .errors
                                  ?.poomsae_type && (
                                  <div
                                    className="cd-error"
                                    style={{
                                      marginTop:
                                        6,
                                    }}
                                  >
                                    {
                                      row
                                        .errors
                                        .poomsae_type
                                    }
                                  </div>
                                )}

                              </div>
                            </div>
                          )}


                          {/* =================================
                              Insurance number
                          ================================= */}

                          <div className="cd-row">

                            <label className="cd-label">
                              شماره بیمه
                            </label>


                            <div className="cd-value">

                              <input
                                className="cd-input"
                                dir="ltr"
                                inputMode="numeric"
                                pattern="\\d*"
                                value={
                                  row.ins ||
                                  ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  onChangeIns(
                                    studentId,
                                    event
                                      .target
                                      .value
                                  )
                                }
                                aria-invalid={
                                  !!row
                                    .errors
                                    ?.ins
                                }
                                placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                              />


                              {row
                                .errors
                                ?.ins && (
                                <div
                                  className="cd-error"
                                  style={{
                                    marginTop:
                                      6,
                                  }}
                                >
                                  {
                                    row
                                      .errors
                                      .ins
                                  }
                                </div>
                              )}

                            </div>
                          </div>


                          {/* =================================
                              Insurance date
                          ================================= */}

                          <div
                            className="cd-row"
                            title="حداقل ۷۲ ساعت قبل از مسابقه"
                          >

                            <label className="cd-label">
                              تاریخ صدور بیمه
                            </label>


                            <div className="cd-value">

                              <DatePicker
                                inputClass="cd-input"
                                calendar={
                                  persian
                                }
                                locale={
                                  persian_fa
                                }
                                format="YYYY/MM/DD"
                                value={
                                  row.ins_date
                                    ? new DateObject(
                                        {
                                          date:
                                            normalizeDigits(
                                              row.ins_date
                                            ).replace(
                                              /-/g,
                                              "/"
                                            ),

                                          calendar:
                                            persian,

                                          locale:
                                            persian_fa,

                                          format:
                                            "YYYY/MM/DD",
                                        }
                                      )
                                    : null
                                }
                                onChange={(
                                  value
                                ) =>
                                  onChangeInsDate(
                                    studentId,
                                    value
                                  )
                                }
                                editable={
                                  false
                                }
                                calendarPosition="bottom-right"
                              />


                              {row
                                .errors
                                ?.ins_date && (
                                <div
                                  className="cd-error"
                                  style={{
                                    marginTop:
                                      6,
                                  }}
                                >
                                  {
                                    row
                                      .errors
                                      .ins_date
                                  }
                                </div>
                              )}

                            </div>
                          </div>

                        </div>
                      )}

                  </div>
                );
              }
            )}

          </div>
        )}

      </section>


      {/* =================================================
          Discount
      ================================================= */}

      <section className="cd-section">

        <div className="cd-discount-box">

          <label className="cd-discount-checkbox">

            <input
              type="checkbox"
              checked={
                hasDiscount
              }
              onChange={(
                event
              ) => {
                const checked =
                  event.target
                    .checked;


                setHasDiscount(
                  checked
                );


                if (!checked) {
                  setDiscountCode(
                    ""
                  );

                  setDiscountAmount(
                    0
                  );

                  setFinalAmount(
                    totalAmount
                  );

                  setOriginalAmount(
                    totalAmount
                  );

                  setDiscountApplied(
                    false
                  );

                } else {
                  setDiscountApplied(
                    false
                  );
                }
              }}
            />


            <span>
              کد تخفیف دارم
            </span>

          </label>


          {hasDiscount && (
            <div className="cd-discount-row">

              <input
                className="cd-input"
                placeholder="مثلاً ALICOACH"
                value={
                  discountCode
                }
                onChange={(
                  event
                ) => {
                  setDiscountCode(
                    event.target
                      .value
                  );

                  setDiscountApplied(
                    false
                  );
                }}
              />


              <button
                type="button"
                className="btn btn-outline"
                onClick={
                  handleApplyDiscount
                }
                disabled={
                  discountLoading
                }
              >
                {discountLoading
                  ? "در حال بررسی…"
                  : "اعمال"}
              </button>

            </div>
          )}


          <div className="cd-discount-summary">

            <div>
              مبلغ اولیه:{" "}
              <strong>
                {toFa(
                  Number(
                    originalAmount
                  ).toLocaleString()
                )}
              </strong>{" "}
              ریال
            </div>


            <div>
              مبلغ تخفیف:{" "}
              <strong>
                {toFa(
                  Number(
                    discountAmount
                  ).toLocaleString()
                )}
              </strong>{" "}
              ریال
            </div>


            <div>
              مبلغ قابل پرداخت:{" "}
              <strong>
                {toFa(
                  Number(
                    finalAmount
                  ).toLocaleString()
                )}
              </strong>{" "}
              ریال
            </div>

          </div>

        </div>
      </section>


      {/* =================================================
          Actions
      ================================================= */}

      <div
        className="cd-actions"
        style={{
          marginTop: 16,
        }}
      >

        <button
          type="button"
          className="btn btn-light"
          onClick={() =>
            navigate(-1)
          }
        >
          بازگشت
        </button>


        <div className="cd-actions-right">

          <div className="cd-chip">
            انتخاب‌های جدید:{" "}
            <strong>
              {toFa(
                selectedNewIds.length
              )}
            </strong>
          </div>


          <div className="cd-chip">
            مبلغ کل:{" "}
            <strong>
              {toFa(
                Number(
                  finalAmount
                ).toLocaleString()
              )}
            </strong>{" "}
            ریال
          </div>


          {discountAmount >
            0 && (
            <div className="cd-chip cd-chip-muted">
              شامل تخفیف:{" "}
              {toFa(
                Number(
                  discountAmount
                ).toLocaleString()
              )}{" "}
              ریال
            </div>
          )}


          <button
            type="button"
            className="btn btn-primary"
            disabled={
              !canSubmit ||
              loading
            }
            onClick={() =>
              setConfirmOpen(
                true
              )
            }
            title={
              !canSubmit
                ? "حداقل یک شاگرد جدید و اطلاعات کامل لازم است"
                : ""
            }
          >
            تأیید و پرداخت
          </button>

        </div>
      </div>


      {/* =================================================
          Confirmation modal

          این Modal باقی می‌ماند چون
          Yes / No از کاربر می‌خواهد.
      ================================================= */}

      {confirmOpen && (
        <div
          className="cd-modal"
          onClick={() => {
            if (!loading) {
              setConfirmOpen(
                false
              );
            }
          }}
        >

          <div
            className="cd-modal-inner cd-modal-inner--tiny cd-modal-inner--white"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <button
              type="button"
              className="cd-modal-close"
              onClick={() =>
                setConfirmOpen(
                  false
                )
              }
              disabled={
                loading
              }
            >
              ✕
            </button>


            <h3
              className="cd-section-title"
              style={{
                marginTop: 0,
                textAlign:
                  "center",
              }}
            >
              تأیید ثبت‌نام
            </h3>


            <div
              className="cd-muted"
              style={{
                textAlign:
                  "center",

                marginBottom:
                  12,
              }}
            >
              {`آیا از ثبت‌نام ${toFa(
                selectedNewIds.length
              )} نفر با مبلغ کل ${toFa(
                Number(
                  finalAmount
                ).toLocaleString()
              )} ریال اطمینان دارید؟`}
            </div>


            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "center",

                gap: 8,
              }}
            >

              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setConfirmOpen(
                    false
                  )
                }
                disabled={
                  loading
                }
              >
                انصراف
              </button>


              <button
                type="button"
                className="btn btn-primary"
                onClick={
                  submit
                }
                disabled={
                  loading
                }
              >
                {loading
                  ? "در حال ثبت…"
                  : "بله، ادامه"}
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}