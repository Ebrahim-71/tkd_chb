// src/App.js

import React, {
  useEffect,
} from "react";

import {
  HashRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import {
  Helmet,
} from "react-helmet";


/* =========================================================
   Homepage
========================================================= */

import Header
  from "./components/homepage/heder/header";

import Footer
  from "./components/homepage/footer/Footer";

import HomeOverviewSection
  from "./components/homepage/main/overview/HomeOverviewSection";
import CoachesPage
  from "./components/homepage/coaches/CoachesPage";
import ClubsPage
  from "./components/homepage/clubs/ClubsPage";
import Userpanel
  from "./components/homepage/main/userpanel/userpanel";


/* =========================================================
   Public Pages
========================================================= */

import NewsDetail
  from "./pages/NewsDetail";

import CircularDetail
  from "./pages/CircularDetail";

import PaymentResult
  from "./pages/PaymentResult";


/* =========================================================
   Register
========================================================= */

import RegisterCoachPage
  from "./pages/RegisterCoachPage";

import RegisterplayerPage
  from "./pages/RegisterplayerPage";

import RegisterClubPage
  from "./pages/RegisterClubPage";


/* =========================================================
   Dashboard
========================================================= */

import Dashboard
  from "./components/Login/panel/Dashboard";

import PrivateRoute
  from "./components/common/PrivateRoute";


/* =========================================================
   Competitions
========================================================= */

import CompetitionDetails
  from "./components/Login/competitions/CompetitionDetails";

import CompetitionBracket
  from "./components/Login/competitions/CompetitionBracket";

import PoomsaeDrawView
  from "./components/Login/competitions/PoomsaeDrawView";

import CompetitionResults
  from "./components/Login/competitions/CompetitionResults";

import EnrollmentCard
  from "./components/Login/competitions/EnrollmentCard";

import CoachRegisterStudents
  from "./components/Login/competitions/CoachRegisterStudents";

import EnrollmentCardsBulk
  from "./components/Login/competitions/EnrollmentCardsBulk";

import PoomsaeTeamRegister
  from "./components/Login/competitions/PoomsaeTeamRegister";


/* =========================================================
   Seminar
========================================================= */

import SeminarDetail
  from "./components/Login/seminar/SeminarDetail";


/* =========================================================
   Global Message
========================================================= */

import GlobalMessageModal
  from "./components/common/GlobalMessageModal/GlobalMessageModal";


/* =========================================================
   API
========================================================= */

import {
  setupGlobalAxiosErrors,
} from "./api/setupGlobalAxiosErrors";


import "./App.css";


setupGlobalAxiosErrors();


/* =========================================================
   Scroll To Top
========================================================= */

function ScrollToTop() {

  const {
    pathname,
  } = useLocation();


  useEffect(() => {

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

  }, [
    pathname,
  ]);


  return null;
}


/* =========================================================
   HOME
========================================================= */

const MainPage = () => {

  return (
    <>

      <Helmet>

        <title>
          هیئت تکواندو چهارمحال و بختیاری
        </title>


        <meta
          name="description"
          content="سایت رسمی هیئت تکواندو استان چهارمحال و بختیاری | اطلاعیه‌ها، اخبار، مسابقات و ثبت‌نام بازیکن، مربی و باشگاه"
        />


        <meta
          name="keywords"
          content="هیئت تکواندو شهرکرد، هیئت تکواندو استان چهارمحال و بختیاری، تکواندو شهرکرد، مسابقات تکواندو، تکواندو چهارمحال و بختیاری، chbtkd.ir، chbtkd"
        />

      </Helmet>


      <div className="home-page-shell">

        <Userpanel />

        <HomeOverviewSection />

      </div>

    </>
  );
};


/* =========================================================
   APP LAYOUT
========================================================= */

const AppLayout = () => {

  const location =
    useLocation();


  const isHomePage =
    location.pathname === "/";


  return (

    <div
      className={
        `App ${
          isHomePage
            ? "is-home-page"
            : "is-inner-page"
        }`
      }
    >

      <Header />


      <main className="main-content">

        <Routes>


          {/* =================================================
              PUBLIC COMPETITIONS
              مخصوص ورود از صفحه اصلی
          ================================================= */}


          <Route
            path="/competitions/:slug"
            element={
              <CompetitionDetails />
            }
          />


          <Route
            path="/competitions/:slug/bracket"
            element={
              <CompetitionBracket />
            }
          />


          <Route
            path="/competitions/:slug/poomsae-draw"
            element={
              <PoomsaeDrawView />
            }
          />


          <Route
            path="/competitions/:slug/results"
            element={
              <CompetitionResults />
            }
          />


          {/* =================================================
              DASHBOARD
          ================================================= */}

          <Route
            path="/dashboard/:role"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          >


            <Route
              path="competitions/:slug"
              element={
                <CompetitionDetails />
              }
            />


            <Route
              path="competitions/:slug/bracket"
              element={
                <CompetitionBracket />
              }
            />


            <Route
              path="competitions/:slug/poomsae-draw"
              element={
                <PoomsaeDrawView />
              }
            />


            <Route
              path="competitions/:slug/register/athlete"
              element={
                <CoachRegisterStudents />
              }
            />


            <Route
              path="competitions/:slug/register/team"
              element={
                <PoomsaeTeamRegister />
              }
            />


            <Route
              path="enrollments/:enrollmentId/card"
              element={
                <EnrollmentCard />
              }
            />


            <Route
              path="enrollments/bulk"
              element={
                <EnrollmentCardsBulk />
              }
            />


            <Route
              path="competitions/:slug/results"
              element={
                <CompetitionResults />
              }
            />


            <Route
              path="courses/:slug"
              element={
                <SeminarDetail />
              }
            />

          </Route>


          {/* =================================================
              PAYMENT
          ================================================= */}

          <Route
            path="/payment/result"
            element={
              <PaymentResult />
            }
          />


          {/* =================================================
              NEWS
          ================================================= */}

          <Route
            path="/news/:id"
            element={
              <NewsDetail />
            }
          />


          {/* =================================================
              CIRCULAR
          ================================================= */}

          <Route
            path="/circular/:id"
            element={
              <CircularDetail />
            }
          />


          {/* =================================================
              REGISTER
          ================================================= */}

          <Route
            path="/register-coach"
            element={
              <RegisterCoachPage />
            }
          />


          <Route
            path="/register-player"
            element={
              <RegisterplayerPage />
            }
          />


          <Route
            path="/register-club"
            element={
              <RegisterClubPage />
            }
          />

          <Route
            path="/coaches"
            element={
              <CoachesPage />
            }
          />
          <Route
            path="/clubs"
            element={
              <ClubsPage />
            }
          />
          {/* =================================================
              HOME
          ================================================= */}

          <Route
            path="/"
            element={
              <MainPage />
            }
          />


          {/* =================================================
              FALLBACK
          ================================================= */}

          <Route
            path="*"
            element={
              <MainPage />
            }
          />

        </Routes>

      </main>


      <div id="site-footer">

        <Footer />

      </div>

    </div>
  );
};


/* =========================================================
   APP
========================================================= */

function App() {

  return (

    <Router>

      <ScrollToTop />

      <GlobalMessageModal />

      <AppLayout />

    </Router>

  );
}


export default App;