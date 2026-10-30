import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Snapshot } from "./types";

interface UploadState {
  jobId: string | null;
  snapshot: Snapshot | null;
  connected: boolean;
  error: string | null;
}

const initialState: UploadState = {
  jobId: null,
  snapshot: null,
  connected: false,
  error: null,
};

const uploadSlice = createSlice({
  name: "upload",
  initialState,
  reducers: {
    jobStarted(state, action: PayloadAction<Snapshot>) {
      state.jobId = action.payload.id;
      state.snapshot = action.payload;
      state.error = null;
      state.connected = false;
    },
    snapshotReceived(state, action: PayloadAction<Snapshot>) {
      state.snapshot = action.payload;
      state.connected = true;
    },
    connectionChanged(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
    jobFailed(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.connected = false;
    },
    reset() {
      return initialState;
    },
  },
});

export const { jobStarted, snapshotReceived, connectionChanged, jobFailed, reset } =
  uploadSlice.actions;
export default uploadSlice.reducer;
