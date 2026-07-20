import { createSlice } from '@reduxjs/toolkit';
import { apiSlice } from '../apiSlice';

const isAdminRole = (data) => data?.role === 'SUPER_ADMIN' || data?.role === 'admin';

const loadPersistedAuth = () => {
  try {
    const rawUser = localStorage.getItem('userInfo');
    const rawAdmin = localStorage.getItem('adminInfo');
    const userInfo = rawUser ? JSON.parse(rawUser) : null;
    const adminInfo = rawAdmin ? JSON.parse(rawAdmin) : null;

    const safeUser = userInfo?.token ? userInfo : null;
    const safeAdmin = adminInfo?.token ? adminInfo : null;

    return {
      user: safeUser,
      admin: safeAdmin,
      token: safeUser?.token || safeAdmin?.token || null,
    };
  } catch {
    return { user: null, admin: null, token: null };
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: loadPersistedAuth(),
  reducers: {
    setCredentials: (state, action) => {
      const data = action.payload;
      if (!data?.token) {
        return;
      }

      state.user = data;
      state.token = data.token;

      if (isAdminRole(data)) {
        state.admin = data;
        localStorage.setItem('adminInfo', JSON.stringify(data));
        localStorage.setItem('userInfo', JSON.stringify(data));
      } else {
        state.admin = null;
        localStorage.setItem('userInfo', JSON.stringify(data));
        localStorage.removeItem('adminInfo');
      }
    },
    logout: (state) => {
      state.user = null;
      state.admin = null;
      state.token = null;
      localStorage.removeItem('userInfo');
      localStorage.removeItem('adminInfo');
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentAdmin = (state) => state.auth.admin;
export const selectAuthToken = (state) => state.auth.token;
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
  }),
});

export const {
  useLoginMutation,
  useAdminLoginMutation,
  useRegisterMutation,
} = authApiSlice;
