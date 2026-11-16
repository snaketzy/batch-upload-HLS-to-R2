import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { StorageProvider } from "./types";

export type UploadMode = "batch" | "single";
const ALL_PROVIDERS: StorageProvider[] = ["r2", "cos"];

interface UiState {
  mode: UploadMode;
  selectedProviders: StorageProvider[];
}

const initialState: UiState = { mode: "batch", selectedProviders: ["r2"] };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<UploadMode>) {
      state.mode = action.payload;
    },
    setSelectedProviders(state, action: PayloadAction<StorageProvider[]>) {
      const deduped = ALL_PROVIDERS.filter((provider) => action.payload.includes(provider));
      state.selectedProviders = deduped.length > 0 ? deduped : ["r2"];
    },
    toggleProvider(state, action: PayloadAction<StorageProvider>) {
      const provider = action.payload;
      const exists = state.selectedProviders.includes(provider);
      if (exists) {
        if (state.selectedProviders.length > 1) {
          state.selectedProviders = state.selectedProviders.filter((item) => item !== provider);
        }
        return;
      }
      state.selectedProviders = ALL_PROVIDERS.filter(
        (item) => item === provider || state.selectedProviders.includes(item),
      );
    },
    selectAllProviders(state) {
      state.selectedProviders = [...ALL_PROVIDERS];
    },
  },
});

export const { setMode, setSelectedProviders, toggleProvider, selectAllProviders } =
  uiSlice.actions;
export default uiSlice.reducer;
