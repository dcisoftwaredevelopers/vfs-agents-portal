import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_ROOT_URL } from '../config/api';

export const API_BASE_URL = API_ROOT_URL;

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = getState()?.auth?.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['User', 'Tracking', 'AuditLogs', 'VisaApplications', 'PaymentVerifications', 'SubscriptionPayments'],
  endpoints: () => ({}),
});
