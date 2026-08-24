import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import "./PaginatedList.css";


const PaginatedList = ({
  items = [],
  renderItem,

  // تعداد پیش‌فرض
  itemsPerPage = 4,

  // اگر داده شود، در موبایل استفاده می‌شود
  mobileItemsPerPage = null,

  breakpoint = 768,

  className = "",
}) => {
  const [page, setPage] =
    useState(1);

  const [isMobile, setIsMobile] =
    useState(
      typeof window !== "undefined"
        ? window.innerWidth <= breakpoint
        : false
    );


  // =====================================
  // تشخیص موبایل
  // =====================================

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(
        window.innerWidth <= breakpoint
      );
    };

    handleResize();

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, [breakpoint]);


  const effectiveItemsPerPage =
    isMobile &&
    mobileItemsPerPage
      ? mobileItemsPerPage
      : itemsPerPage;


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        items.length /
        effectiveItemsPerPage
      )
    );


  // =====================================
  // با تغییر اندازه صفحه، شماره صفحه معتبر بماند
  // =====================================

  useEffect(() => {
    setPage((currentPage) =>
      Math.min(
        Math.max(currentPage, 1),
        totalPages
      )
    );
  }, [totalPages]);


  // اگر desktop/mobile عوض شد
  // از صفحه اول شروع شود
  useEffect(() => {
    setPage(1);
  }, [effectiveItemsPerPage]);


  // =====================================
  // آیتم‌های صفحه جاری
  // =====================================

  const currentItems =
    useMemo(() => {
      const start =
        (page - 1) *
        effectiveItemsPerPage;

      const end =
        start +
        effectiveItemsPerPage;

      return items.slice(
        start,
        end
      );
    }, [
      items,
      page,
      effectiveItemsPerPage,
    ]);


  // =====================================
  // حداکثر 5 شماره صفحه
  // =====================================

  const visiblePages =
    useMemo(() => {
      const maxVisible = 5;

      if (
        totalPages <= maxVisible
      ) {
        return Array.from(
          { length: totalPages },
          (_, index) =>
            index + 1
        );
      }

      let startPage =
        page - 2;

      let endPage =
        page + 2;


      if (startPage < 1) {
        startPage = 1;
        endPage = maxVisible;
      }


      if (
        endPage > totalPages
      ) {
        endPage = totalPages;

        startPage =
          totalPages -
          maxVisible +
          1;
      }


      return Array.from(
        {
          length:
            endPage -
            startPage +
            1,
        },
        (_, index) =>
          startPage +
          index
      );
    }, [
      page,
      totalPages,
    ]);


  const changePage = (
    newPage
  ) => {
    if (
      newPage < 1 ||
      newPage > totalPages
    ) {
      return;
    }

    setPage(newPage);
  };


  return (
    <div
      className={`paginated-list ${className}`}
    >

      <div className="paginated-list-items">

        {currentItems.map(
          (item, index) => (
            <React.Fragment
              key={
                item?.id ??
                item?.public_id ??
                item?.publicId ??
                `${page}-${index}`
              }
            >
              {renderItem(
                item,
                index
              )}
            </React.Fragment>
          )
        )}

      </div>


      {totalPages > 1 && (
        <div
          className="pagination-controls"
          dir="ltr"
        >

          {/* قبلی */}
          <button
            type="button"
            className="pagination-button pagination-arrow"
            onClick={() =>
              changePage(
                page - 1
              )
            }
            disabled={
              page === 1
            }
            aria-label="صفحه قبلی"
          >
            ‹
          </button>


          {visiblePages.map(
            (pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                className={
                  `pagination-button ${
                    pageNumber === page
                      ? "active"
                      : ""
                  }`
                }
                onClick={() =>
                  changePage(
                    pageNumber
                  )
                }
              >
                {pageNumber}
              </button>
            )
          )}


          {/* بعدی */}
          <button
            type="button"
            className="pagination-button pagination-arrow"
            onClick={() =>
              changePage(
                page + 1
              )
            }
            disabled={
              page === totalPages
            }
            aria-label="صفحه بعدی"
          >
            ›
          </button>

        </div>
      )}

    </div>
  );
};


export default PaginatedList;