document.addEventListener("DOMContentLoaded", function () {
    const dateInputs = document.querySelectorAll('input.vDateField');

    dateInputs.forEach(function (input) {
        $(input).persianDatepicker({
            initialValueType: 'gregorian',  // مقدار پیش‌فرض برای فیلد
            format: 'YYYY/MM/DD',
            calendarType: 'persian',        // 👈 اجباری برای سال شمسی
            autoClose: true,
            calendar: {
                persian: {
                    locale: 'fa',
                    leapYearMode: 'algorithmic'  // دقت بهتر
                }
            },
            toolbox: {
                calendarSwitch: {
                    enabled: false // جلوگیری از سوئیچ تقویم میلادی
                },
                todayButton: {
                    enabled: true,
                    text: {
                        fa: "امروز"
                    }
                }
            },
            navigator: {
                scroll: {
                    enabled: false
                }
            }
        });
    });
});
