import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import { LanguageProvider } from './context/LanguageContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import WhatsAppButton from './components/WhatsAppButton';

const GlobalHome = lazy(() => import('./pages/GlobalHome'));
const InfoPage = lazy(() => import('./pages/InfoPage'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile'));
const BookAppointment = lazy(() => import('./pages/BookAppointment'));
const TrackApplication = lazy(() => import('./pages/TrackApplication'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminResetPassword = lazy(() => import('./pages/AdminResetPassword'));
const AgentResetPassword = lazy(() => import('./pages/AgentResetPassword'));
const Classes = lazy(() => import('./pages/Classes'));

const LoadingFallback = () => (
  <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    Loading page...
  </div>
);

function App() {
  return (
    <LanguageProvider>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
          <main style={{ flexGrow: 1 }}>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/" element={<GlobalHome />} />
                <Route path="/info/:pageKey" element={<InfoPage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/complete-profile" element={<CompleteProfile />} />
                <Route path="/book" element={<BookAppointment />} />
                <Route path="/track" element={<TrackApplication />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin-login" element={<AdminLogin />} />
                <Route path="/admin-reset-password" element={<AdminResetPassword />} />
                <Route path="/reset-password" element={<AgentResetPassword />} />
                <Route path="/classes/:className" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
                <Route
                  path="/admin-dashboard"
                  element={
                    <ProtectedRoute adminOnly={true}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent-dashboard"
                  element={
                    <ProtectedRoute>
                      <AgentDashboard />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
          </main>
          <Footer />
          <WhatsAppButton />
          <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} />
        </div>
    </LanguageProvider>
  );
}

export default App;
