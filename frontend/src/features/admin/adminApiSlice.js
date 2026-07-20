import { apiSlice } from '../apiSlice';

export const adminApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query({
      query: () => '/admin/users',
      transformResponse: (data) =>
        (data || []).map((user) => ({
          id: user._id,
          name: user.agencyName || user.ownerName || user.name || user.email,
          email: user.email,
          regDate: user.createdAt,
          status: user.status || 'Pending',
        })),
      providesTags: ['User'],
    }),
    getAuditLogs: builder.query({
      query: ({
        page = 1,
        limit = 25,
        country = '',
        centerId = '',
        adminUser = '',
        actionType = '',
        startDate = '',
        endDate = '',
      } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });

        if (country) params.append('country', country);
        if (centerId) params.append('centerId', centerId);
        if (adminUser) params.append('adminUser', adminUser);
        if (actionType) params.append('actionType', actionType);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        return `/admin/audit-logs?${params.toString()}`;
      },
      providesTags: ['AuditLogs'],
      keepUnusedDataFor: 300,
    }),
    getVisaApplications: builder.query({
      query: ({
        page = 1,
        limit = 25,
        search = '',
        month = '',
        status = 'All',
      } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });

        if (search) params.append('search', search);
        if (month) params.append('month', month);
        if (status && status !== 'All') params.append('status', status);

        return `/admin/appointments?${params.toString()}`;
      },
      providesTags: ['VisaApplications'],
      keepUnusedDataFor: 300,
    }),
    getPaymentsVerification: builder.query({
      query: ({ page = 1, limit = 25 } = {}) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        return `/admin/payments-verification?${params.toString()}`;
      },
      providesTags: ['PaymentVerifications'],
      keepUnusedDataFor: 60,
    }),
    approvePaymentVerification: builder.mutation({
      query: (id) => ({ url: `/admin/payments-verification/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['PaymentVerifications'],
    }),
    rejectPaymentVerification: builder.mutation({
      query: ({ id, reason }) => ({ url: `/admin/payments-verification/${id}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: ['PaymentVerifications'],
    }),
    getSubscriptionPayments: builder.query({
      query: ({ page = 1, limit = 25, search = '', status = '' } = {}) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        return `/admin/subscription-payments?${params.toString()}`;
      },
      providesTags: ['SubscriptionPayments'],
      keepUnusedDataFor: 60,
    }),
    approveSubscriptionPayment: builder.mutation({
      query: (id) => ({ url: `/admin/subscription-payments/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['SubscriptionPayments'],
    }),
    rejectSubscriptionPayment: builder.mutation({
      query: ({ id, remarks }) => ({ url: `/admin/subscription-payments/${id}/reject`, method: 'POST', body: { remarks } }),
      invalidatesTags: ['SubscriptionPayments'],
    }),
    updateVisaApplicationStatus: builder.mutation({
      query: ({ id, applicationStatus }) => ({
        url: `/admin/appointments/${id}/status`,
        method: 'PUT',
        body: { applicationStatus },
      }),
      invalidatesTags: ['VisaApplications'],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetAuditLogsQuery,
  useGetVisaApplicationsQuery,
  useGetPaymentsVerificationQuery,
  useApprovePaymentVerificationMutation,
  useRejectPaymentVerificationMutation,
  useGetSubscriptionPaymentsQuery,
  useApproveSubscriptionPaymentMutation,
  useRejectSubscriptionPaymentMutation,
  useUpdateVisaApplicationStatusMutation,
} = adminApiSlice;
