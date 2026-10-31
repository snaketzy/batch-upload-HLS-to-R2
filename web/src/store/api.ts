import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  ConfigResult,
  DirEntry,
  DirSummary,
  ListResult,
  R2DeleteResult,
  R2ListResult,
  R2PrefixStat,
  R2RenameTask,
  Snapshot,
} from "./types";

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
  tagTypes: ["R2List"],
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
      providesTags: ["R2List"],
    }),
    statR2Prefix: build.query<R2PrefixStat, string>({
      query: (prefix) => `/r2/stat?prefix=${encodeURIComponent(prefix)}`,
    }),
    deleteR2Prefix: build.mutation<R2DeleteResult, string>({
      query: (prefix) => ({ url: "/r2/delete", method: "POST", body: { prefix } }),
      invalidatesTags: ["R2List"],
    }),
    renameR2Prefix: build.mutation<R2RenameTask, { from: string; to: string }>({
      query: (body) => ({ url: "/r2/rename", method: "POST", body }),
      invalidatesTags: ["R2List"],
    }),
    getRenameTask: build.query<R2RenameTask, string>({
      query: (id) => `/r2/rename/${id}`,
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
  useStatR2PrefixQuery,
  useDeleteR2PrefixMutation,
  useRenameR2PrefixMutation,
  useGetRenameTaskQuery,
  useStartUploadMutation,
  useCancelUploadMutation,
} = api;
