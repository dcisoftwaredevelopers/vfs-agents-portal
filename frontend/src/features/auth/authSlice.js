import { createSlice } from '@reduxjs/toolkit';
import { apiSlice } from '../apiSlice';

const isAdminRole = (data) => data?.role === 'SUPER_ADMIN' || data?.role === 'admin';

const withoutToken = (data) => {
  if (!data) return null;
  const { token, ...safeData } = data;
  return safeData;
};

const loadPersistedAuth = () => {
  try {
    const rawUser = localStorage.getItem('userInfo');
    const rawAdmin = localStorage.getItem('adminInfo');
    const userInfo = rawUser ? JSON.parse(rawUser) : null;
    const adminInfo = rawAdmin ? JSON.parse(rawAdmin) : null;

    const safeUser = userInfo?._id ? withoutToken(userInfo) : null;
    const safeAdmin = adminInfo?._id ? withoutToken(adminInfo) : null;

    if (safeUser && userInfo?.token) {
      localStorage.setItem('userInfo', JSON.stringify(safeUser));
    }
    if (safeAdmin && adminInfo?.token) {
      localStorage.setItem('adminInfo', JSON.stringify(safeAdmin));
    }

    return {
      user: safeUser,
      admin: safeAdmin,
    };
  } catch {
    return { user: null, admin: null };
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: loadPersistedAuth(),
  reducers: {
    setCredentials: (state, action) => {
      const data = action.payload;
      if (!data?._id) {
        return;
      }

      const safeData = withoutToken(data);
      state.user = safeData;

      if (isAdminRole(safeData)) {
        state.admin = safeData;
        localStorage.setItem('adminInfo', JSON.stringify(safeData));
        localStorage.setItem('userInfo', JSON.stringify(safeData));
      } else {
        state.admin = null;
        localStorage.setItem('userInfo', JSON.stringify(safeData));
        localStorage.removeItem('adminInfo');
      }
    },
    logout: (state) => {
      state.user = null;
      state.admin = null;
      localStorage.removeItem('userInfo');
      localStorage.removeItem('adminInfo');
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentAdmin = (state) => state.auth.admin;
export const selectIsSuperAdmin = (state) =>
  isAdminRole(state.auth.admin) || isAdminRole(state.auth.user);

export const authApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    adminLogin: builder.mutation({
      query: (credentials) => ({
        url: '/auth/admin-login',
        method: 'POST',
        body: credentials,
      }),
    }),
    register: builder.mutation({
      query: (payload) => ({
        url: '/auth/register',
        method: 'POST',
        body: payload,
      }),
    }),
    googleAuth: builder.mutation({
      query: (payload) => ({
        url: '/auth/google',
        method: 'POST',
        body: payload,
      }),
    }),
    completeProfile: builder.mutation({
      query: (payload) => ({
        url: '/auth/complete-profile',
        method: 'PUT',
        body: payload,
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useAdminLoginMutation,
  useRegisterMutation,
  useGoogleAuthMutation,
  useCompleteProfileMutation,
} = authApiSlice;
