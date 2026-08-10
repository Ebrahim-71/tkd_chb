// src/api/profile.js

import {
  apiFetch,
} from "./apiClient";


function pickToken() {
  const role =
    localStorage.getItem(
      "user_role"
    ) || "";

  const keys = [
    `${role}_token`,
    "both_token",
    "coach_token",
    "player_token",
    "referee_token",
    "club_token",
    "access_token",
  ];

  for (const k of keys) {
    const v =
      localStorage.getItem(k);

    if (v) {
      return v;
    }
  }

  return null;
}


export async function getMyProfile() {
  const token = pickToken();

  const r = await apiFetch(
    "https://api.chbtkd.ir/api/auth/user-profile-with-form-data/",
    {
      method: "GET",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${token}`,
      },

      credentials: "omit",

      // عنوان مودال در صورت خطای API
      errorTitle:
        "دریافت اطلاعات پروفایل",
    }
  );


  const data =
    await r.json();


  if (!r.ok) {
    // Modal قبلاً توسط apiFetch نمایش داده شده.
    // throw را نگه می‌داریم تا منطق قبلی
    // Componentهای استفاده‌کننده خراب نشود.
    throw new Error(
      data?.detail ||
      "خطا در دریافت پروفایل"
    );
  }


  const p =
    data.profile || {};


  const coachName = [
    p.first_name,
    p.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();


  const clubs =
    new Set();


  if (
    p.club &&
    p.club.club_name
  ) {
    clubs.add(
      p.club.club_name
    );
  }


  if (
    Array.isArray(
      p.coaching_clubs
    )
  ) {
    p.coaching_clubs.forEach(
      (club) => {
        if (club?.club_name) {
          clubs.add(
            club.club_name
          );
        }
      }
    );
  }


  return {
    coachName,

    clubNames:
      Array.from(clubs),
  };
}