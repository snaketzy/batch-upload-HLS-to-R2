import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UploadMode = "batch" | "single";

interface UiState {
  mode: UploadMode;
}

const initialState: UiState = { mode: "batch" };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<UploadMode>) {
      state.mode = action.payload;
    },
  },
});

export const { setMode } = uiSlice.actions;
export default uiSlice.reducer;
