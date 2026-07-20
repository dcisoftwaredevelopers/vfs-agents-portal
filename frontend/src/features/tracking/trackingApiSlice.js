import { apiSlice } from '../apiSlice';

export const trackingApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    trackApplication: builder.query({
      query: ({ referenceNumber, lastName }) =>
        `/tracking/track?referenceNumber=${encodeURIComponent(referenceNumber)}&lastName=${encodeURIComponent(lastName)}`,
      providesTags: ['Tracking'],
    }),
  }),
});

export const { useLazyTrackApplicationQuery } = trackingApiSlice;
