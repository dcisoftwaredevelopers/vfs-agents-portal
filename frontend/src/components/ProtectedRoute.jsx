import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { selectCurrentUser, selectCurrentAdmin } from '../features/auth/authSlice';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const user = useSelector(selectCurrentUser);
  const admin = useSelector(selectCurrentAdmin);

  if (adminOnly) {
    if (!admin) {
      return <Navigate to="/admin-login" replace />;
    }
  } else if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}