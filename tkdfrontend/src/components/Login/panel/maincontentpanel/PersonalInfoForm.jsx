import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './PersonalInfoForm.css';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import provincesData from "../../../Register/provincesData";
import {
  showGlobalMessage,
  showGlobalSuccess,
} from "../../../../services/globalMessage";
export default function PersonalInfoForm() {
  const [data, setData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [dropdowns, setDropdowns] = useState({});
  const [editableFields, setEditableFields] = useState({});
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const role = localStorage.getItem('user_role');
  const token = localStorage.getItem(`${role}_token`);
  const headers = { Authorization: `Bearer ${token}` };

  const [counties, setCounties] = useState([]);
  const [cities, setCities] = useState([]);

  
  const validateRefereeLevels = () => {
    if (!data.is_referee) {
      return true;
    }

    const typeLabels = {
      kyorogi: "کیوروگی",
      poomseh: "پومسه",
      hanmadang: "هانمادانگ",
    };

    const errors = [];

    ['kyorogi', 'poomseh', 'hanmadang'].forEach(
      (type) => {
        if (data[type]) {
          const national =
            data[`${type}_level`];

          if (!national) {
            errors.push(
              `درجه ملی داوری ${typeLabels[type] || type} الزامی است.`
            );
          }
        }
      }
    );

    if (errors.length > 0) {
      showGlobalMessage({
        type: "warning",
        title: "اطلاعات داوری ناقص است",
        messages: errors,
      });

      return false;
    }

    return true;
  };

  useEffect(() => {
    if (!role || !token) {
      navigate('/');
      return;
    }

    axios.get(`https://api.chbtkd.ir/api/auth/user-profile-with-options/`, { headers })
      .then((res) => {
        res.data.profile.selectedClubs = res.data.profile.coaching_clubs || [];
        setData(res.data.profile);
        setOriginalData(res.data.profile);
        setDropdowns({
          tkd_board: res.data.form_options.heyats.map(h => ({ value: h.id, label: h.name })),
          club: res.data.form_options.clubs.map(c => ({ value: c.id, label: c.club_name })),
          coach: res.data.form_options.coaches.map(c => ({ value: c.id, label: c.full_name })),
          belt_grade: res.data.form_options.belt_choices.map(b => ({ value: b[0], label: b[1] })),
          degree: res.data.form_options.degree_choices.map(d => ({ value: d[0], label: d[1] }))
        });

        const userProvince = res.data.profile.province;
        const userCounty = res.data.profile.county;
        if (userProvince && provincesData[userProvince]) {
          setCounties(Object.keys(provincesData[userProvince]));
          if (userCounty && provincesData[userProvince][userCounty]) {
            setCities(provincesData[userProvince][userCounty]);
          }
        }
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleEditConfirm = (field) => {
    setEditableFields(prev => ({
      ...prev,
      [field]: true
    }));
  };

  const handleChange = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }));

    if (field === 'province') {
      const newCounties = Object.keys(provincesData[value] || {});
      setCounties(newCounties);
      setCities([]);
      setData(prev => ({ ...prev, county: '', city: '' }));
    }

    if (field === 'county') {
      const newCities = provincesData[data.province]?.[value] || [];
      setCities(newCities);
      setData(prev => ({ ...prev, city: '' }));
    }

    if (field === 'club') {
      setData(prev => ({ ...prev, coach: '' }));
      axios.get(`https://api.chbtkd.ir/api/auth/coaches/`, {
        params: { club: parseInt(value), gender: data.gender }
      })
      .then(res => {
        const coachOptions = res.data.coaches.map(c => ({
          value: c.id,
          label: c.full_name
        }));
        setDropdowns(prev => ({ ...prev, coach: coachOptions }));
      }).catch(() => {
        setDropdowns(prev => ({ ...prev, coach: [] }));
      });
    }
  };

  const hasFormChanged = () => {
    if (!originalData || !data) return false;
    if (data.profile_image instanceof File) return true;
    const keys = Object.keys(data);
    return keys.some(key => data[key] !== originalData[key]);
  };

  const getDisplayLabel = (field) => {
    const value = data[field];
    const options = dropdowns[field];
    if (!options) return value;
    const match = options.find(opt => opt.value === value);
    return match ? match.label : value;
  };

  if (loading || !data) return <p className="loading-text">در حال بارگذاری...</p>;

  const staticFields = [
    ['first_name', 'last_name'],
    ['father_name', 'birth_date'],
    ['national_code', 'phone']
  ];

  const editableFieldsList = [
    'province', 'county', 'city', 'address', 'tkd_board', 'club',
    'coach', 'belt_grade', 'belt_certificate_date', 'belt_certificate_number'
  
  ];

  const placeholders = {
     profile_image: "عکس پروفایل",
    first_name: "نام",
    last_name: "نام خانوادگی",
    father_name: "نام پدر",
    birth_date: "تاریخ تولد",
    national_code: "کد ملی",
    phone: "شماره موبایل",
    province: "استان",
    address: "آدرس",
    county: "شهرستان",
    city: "شهر",
    tkd_board: "هیئت تکواندو",
    club: "باشگاه",
    coach: "مربی",
    belt_grade: "درجه کمربند",
    belt_certificate_date: "تاریخ اخذ کمربند",
    belt_certificate_number: "شماره حکم",
    coach_level: "درجه ملی مربیگری",
    coach_level_International: "درجه بین‌المللی مربیگری",
    kyorogi_level: "درجه ملی کیوروگی",
    kyorogi_level_International: "درجه بین‌المللی کیوروگی",
    poomseh_level: "درجه ملی پومسه",
    poomseh_level_International: "درجه بین‌المللی پومسه",
    hanmadang_level: "درجه ملی هانمادانگ",
    hanmadang_level_International: "درجه بین‌المللی هانمادانگ"
  };

  const renderSelectField = (field, optionsList) => (
    <select
      className="input"
      value={data[field] || ''}
      onChange={e => handleChange(field, e.target.value)}
    >
      <option value="">{placeholders[field]}</option>
      {optionsList.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );

  const renderEditableField = (field, forceActive = false) => (
    <div key={field} className="form-cell">
      {editableFields[field] || forceActive ? (
        field === 'belt_certificate_date' ? (
          <DatePicker
            calendar={persian}
            locale={persian_fa}
            value={data[field] || ""}
            onChange={(date) => handleChange(field, date?.format("YYYY/MM/DD"))}
            inputClass="input"
            placeholder={placeholders[field]}
          />
          ) : field === 'province' ? (
          renderSelectField('province', Object.keys(provincesData))
        ) : field === 'county' ? (
          renderSelectField('county', counties)
        ) : field === 'city' ? (
          renderSelectField('city', cities)
        ) : ['belt_grade', 'tkd_board', 'club', 'coach'].includes(field) ? (
          <select
            className="input"
            value={data[field] || ''}
            onChange={e => handleChange(field, e.target.value)}
          >
            <option value="">{placeholders[field]}</option>
            {(dropdowns[field] || []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : field.includes('level') ? (
          <select
            className="input"
            value={data[field] || ''}
            onChange={e => handleChange(field, e.target.value)}
          >
            <option value="">{placeholders[field]}</option>
            {(dropdowns.degree || []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            value={data[field] || ''}
            onChange={e => handleChange(field, e.target.value)}
            placeholder={placeholders[field]}
          />
        )
      ) : (
        <>
          <input disabled className="input" value={getDisplayLabel(field)} placeholder={placeholders[field]} />
             {field === 'club'
              ? (!data.is_coach // کاربر مربی نباشه
                  || (data.is_referee && !data.is_coach) // یا داور باشه و مربی نباشه
                )
                ? !editableFields[field] && (
                    <button
                      type="button"
                      className="edit-btn"
                      onClick={() => {

                      showGlobalMessage({

                      type:"confirm",

                      title:"تأیید ویرایش",

                      message:
                      `آیا می‌خواهید فیلد "${placeholders[field]}" را ویرایش کنید؟`,

                      onConfirm: () => {
                          handleEditConfirm(field);
                      }

                      });

                      }}
                    >
                      ویرایش
                    </button>
                  )
                : null
              : !editableFields[field] && (
                  <button
                    type="button"
                    className="edit-btn"
                    onClick={() => {

                    showGlobalMessage({

                    type:"confirm",

                    title:"تأیید ویرایش",

                    message:
                    `آیا می‌خواهید فیلد "${placeholders[field]}" را ویرایش کنید؟`,

                    onConfirm: () => {
                        handleEditConfirm(field);
                    }

                    });

                    }}
                  >
                    ویرایش
                  </button>
                )
            }



        </>
      )}
    </div>
  );

  return (
    <>
   

      {showConfirmModal && (
        <div className="custom-modal">
          <div className="modal-content">
            <p>آیا از ویرایش اطلاعات خود اطمینان دارید؟ اطلاعات شما پس از تأیید هیئت اعمال خواهد شد.</p>
            <div className="modal-actions">
              <button

                onClick={async () => {
                   if (!validateRefereeLevels()) return;
                  setShowConfirmModal(false);
                  setIsSubmitting(true);
                  try {
                    const formData = new FormData();

                        const completeData = { ...originalData, ...data };

                      // 👇 تبدیل label باشگاه به id (فقط اگر هنوز به id تبدیل نشده)
                      if (
                        completeData.club &&
                        typeof completeData.club === 'string' &&
                        isNaN(completeData.club)
                      ) {
                        const match = (dropdowns.club || []).find(
                          c => c.label === completeData.club
                        );
                        if (match) {
                          completeData.club = match.value;
                        }
                      }



                    // ✅ اضافه‌کردن فیلدها به FormData
                    for (const key in completeData) {
                      const value = completeData[key];

                      if (key === 'profile_image') {
                        if (value instanceof File) {
                          formData.append('profile_image', value);  // فایل واقعی
                        }
                   
                        continue; 
                      }

                      else if (typeof value === 'boolean') {
                        formData.append(key, value ? 'true' : 'false');
                      } 
                      else if (typeof value === 'number' || typeof value === 'string') {
                        formData.append(key, value);
                      }
                    }

                    // ✅ اضافه کردن رشته‌های داوری به صورت دستی
                    const refereeTypes = {};

                      ['kyorogi', 'poomseh', 'hanmadang'].forEach(type => {
                        if (completeData[type]) {
                          refereeTypes[type] = {
                            selected: true,
                            gradeNational: completeData[`${type}_level`] || null
                          };

                          if (completeData[`${type}_level_International`]) {
                            refereeTypes[type].gradeIntl = completeData[`${type}_level_International`];
                          }
                        }
                      });

                    formData.append('refereeTypes', JSON.stringify(refereeTypes));

                    // ✅ اطمینان از ارسال فیلدهای خاص به صورت رشته 'true'/'false'
                    ['kyorogi', 'poomseh', 'hanmadang', 'is_referee'].forEach(field => {
                      formData.append(field, completeData[field] ? 'true' : 'false');
                    });

                    // ✅ ارسال آیدی‌ها
                    if (completeData.id) formData.append('id', completeData.id);
                    if (completeData.user) formData.append('user', completeData.user);

                    await axios.post(
                      'https://api.chbtkd.ir/api/auth/profile/edit/',
                      formData,
                      {
                        headers: {
                          ...headers,
                          'Content-Type':
                            'multipart/form-data',
                        },

                        // خطای این درخواست را خودمان
                        // پایین‌تر پردازش می‌کنیم.
                        // بنابراین interceptor سراسری
                        // نباید Modal دوم ایجاد کند.
                        skipGlobalError: true,
                      }
                    );


                    const shouldReload =
                      data.profile_image instanceof File;


                    if (!shouldReload) {
                      setOriginalData({
                        ...data,
                      });
                    }


                    showGlobalSuccess(
                      "اطلاعات با موفقیت ثبت شد و پس از تأیید هیئت اعمال می‌شود.",
                      "ویرایش اطلاعات ثبت شد",
                      shouldReload
                        ? () => {
                            window.location.reload();
                          }
                        : null
                    );
                 } catch (err) {
                  console.error(
                    "PROFILE_EDIT_ERROR",
                    err?.response?.data || err
                  );


                  const responseData =
                    err?.response?.data;

                  const errors =
                    responseData?.errors;


                  if (
                    errors &&
                    typeof errors === 'object'
                  ) {
                    const errorMessages =
                      Object.entries(errors)
                        .flatMap(
                          ([field, messages]) => {
                            const fieldTitle =
                              placeholders[field] ||
                              field;

                            if (
                              Array.isArray(messages)
                            ) {
                              return messages.map(
                                (message) =>
                                  `${fieldTitle}: ${message}`
                              );
                            }

                            return [
                              `${fieldTitle}: ${messages}`,
                            ];
                          }
                        );


                    showGlobalMessage({
                      type: 'error',
                      title:
                        'خطا در ویرایش اطلاعات',
                      messages:
                        errorMessages.length
                          ? errorMessages
                          : [
                              'برخی اطلاعات واردشده معتبر نیست.',
                            ],
                    });

                    return;
                  }


                  const serverMessage =
                    responseData?.detail ||
                    responseData?.error ||
                    responseData?.message;


                  showGlobalMessage({
                    type: 'error',
                    title:
                      'خطا در ویرایش اطلاعات',
                    message:
                      serverMessage ||
                      (
                        err?.response
                          ? 'ثبت اطلاعات انجام نشد. لطفاً دوباره تلاش کنید.'
                          : 'ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید.'
                      ),
                  });
                }

                      finally {
                    setIsSubmitting(false);
                  }
                }}

            >
              بله، ثبت شود
            </button>

              <button onClick={() => setShowConfirmModal(false)}>خیر</button>
            </div>
          </div>
        </div>
      )}

      <form className="personal-info-form" onSubmit={e => e.preventDefault()}>
        <div className="profile-image-section">
          {data.profile_image instanceof File ? (
            <img
              src={URL.createObjectURL(data.profile_image)}
              className="profile-image"
              alt="پروفایل"
            />
          ) : (
            <img
              src={data.profile_image_url || '/default-avatar.png'}
              className="profile-image"
              alt="پروفایل"
            />
          )}
          <div className="profile-image-upload">
            {editableFields['profile_image'] ? (
              <input
                type="file"
                accept=".jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    if (
                      ![
                        'image/jpeg',
                        'image/jpg',
                      ].includes(file.type)
                    ) {
                      showGlobalMessage({
                        type: 'warning',
                        title: 'فرمت تصویر نامعتبر',
                        message:
                          'فرمت فایل باید JPG یا JPEG باشد.',
                      });

                      return;
                    }


                    if (
                      file.size >
                      200 * 1024
                    ) {
                      showGlobalMessage({
                        type: 'warning',
                        title: 'حجم تصویر زیاد است',
                        message:
                          'حجم فایل نباید بیشتر از ۲۰۰ کیلوبایت باشد.',
                      });

                      return;
                    }
                    setData(prev => ({ ...prev, profile_image: file }));
                  }
                }}
              />
            ) : (
              <button type="button" className="edit-btn" onClick={() => {showGlobalMessage({type:"confirm",title:"ویرایش تصویر",message:"آیا می‌خواهید تصویر پروفایل را ویرایش کنید؟",onConfirm:()=>{setEditableFields(prev=>({...prev,profile_image:true}));}});}}>
                ویرایش تصویر 
              </button>
            )}
          </div>
        </div>

        <div className="form-grid">
          {staticFields.map((pair, i) => (
            <div key={i} className="form-row">
              {pair.map(field => (
                <input
                  key={field}
                  disabled
                  className="input"
                  value={data[field] || ''}
                  placeholder={placeholders[field]}
                />
              ))}
            </div>
          ))}

          {Array.from({ length: Math.ceil(editableFieldsList.length / 2) }, (_, i) => (
            <div key={i} className="form-row">
              {renderEditableField(editableFieldsList[i * 2])}
              {editableFieldsList[i * 2 + 1] ? renderEditableField(editableFieldsList[i * 2 + 1]) : <div />}
            </div>
          ))}

          <div className="coach-referee-section">
            <label>
              <input type="checkbox" checked={data.is_coach} onChange={e => handleChange('is_coach', e.target.checked)} /> مربی شدم
            </label>
            {data.is_coach && (
              <div className="form-row">
                {renderEditableField("coach_level", true)}
                {renderEditableField("coach_level_International", true)}
              </div>
            )}

            <label>
              <input type="checkbox" checked={data.is_referee} onChange={e => handleChange('is_referee', e.target.checked)} /> داور شدم
            </label>
            {data.is_referee && ['kyorogi', 'poomseh', 'hanmadang'].map(type => (
              <div key={type} className="referee-box">
                <label>
                  <input
                    type="checkbox"
                    checked={data[type]}
                    onChange={e => handleChange(type, e.target.checked)}
                  /> {type}
                </label>
                {data[type] && (
                  <div className="form-row">
                    {renderEditableField(`${type}_level`, true)}
                    {renderEditableField(`${type}_level_International`, true)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="action-buttons">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (hasFormChanged()) {
                  setShowConfirmModal(true);
                  return;
                }

                showGlobalMessage({
                  type: 'info',
                  title: 'ویرایشی انجام نشده',
                  message:
                    'هیچ تغییری در اطلاعات ایجاد نشده است.',
                });
              }}
              disabled={!hasFormChanged() || isSubmitting}
            >
              تأیید ویرایش
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => window.location.reload()}
              disabled={!hasFormChanged() || isSubmitting}
            >
              انصراف
            </button>
          </div>

        </div>
      </form>
    </>
  );
}
