import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ConfigResult, DirEntry, DirSummary, ListResult, Snapshot } from "./types";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  endpoints: (build) => ({
    getConfig: build.query<ConfigResult, void>({
      query: () => "/config",
    }),
    getRoots: build.query<DirEntry[], void>({
      query: () => "/fs/roots",
    }),
    listDirs: build.query<ListResult, string>({
      query: (p) => `/fs/list?path=${encodeURIComponent(p)}`,
    }),
    summarize: build.mutation<DirSummary[], string[]>({
      query: (dirs) => ({ url: "/fs/summarize", method: "POST", body: { dirs } }),
    }),
    startUpload: build.mutation<Snapshot, { dirs: string[]; prefix: string }>({
      query: (body) => ({ url: "/uploads", method: "POST", body }),
    }),
    cancelUpload: build.mutation<Snapshot, string>({
      query: (id) => ({ url: `/uploads/${id}/cancel`, method: "POST" }),
    }),
  }),
});

export const {
  useGetConfigQuery,
  useGetRootsQuery,
  useListDirsQuery,
  useSummarizeMutation,
  useStartUploadMutation,
  useCancelUploadMutation,
} = api;
