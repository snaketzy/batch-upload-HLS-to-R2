import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ConfigResult, DirEntry, DirSummary, ListResult, R2ListResult, Snapshot } from "./types";

/** 批量模式传 dirs + prefix；单独目录模式传 dir + targetPath */
export interface StartUploadBody {
  dirs?: string[];
  prefix?: string;
  dir?: string;
  targetPath?: string;
}

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
    listR2Dirs: build.query<R2ListResult, string>({
      query: (prefix) => `/r2/list?prefix=${encodeURIComponent(prefix)}`,
    }),
    startUpload: build.mutation<Snapshot, StartUploadBody>({
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
  useListR2DirsQuery,
  useStartUploadMutation,
  useCancelUploadMutation,
} = api;
