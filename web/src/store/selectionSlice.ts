import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const MAX_DIRS = 10;

interface SelectionState {
  dirs: string[];
}

const initialState: SelectionState = { dirs: [] };

const selectionSlice = createSlice({
  name: "selection",
  initialState,
  reducers: {
    toggle(state, action: PayloadAction<string>) {
      const dir = action.payload;
      const i = state.dirs.indexOf(dir);
      if (i >= 0) state.dirs.splice(i, 1);
      else if (state.dirs.length < MAX_DIRS) state.dirs.push(dir);
    },
    remove(state, action: PayloadAction<string>) {
      state.dirs = state.dirs.filter((d) => d !== action.payload);
    },
    clear(state) {
      state.dirs = [];
    },
    removeMany(state, action: PayloadAction<string[]>) {
      const set = new Set(action.payload);
      state.dirs = state.dirs.filter((d) => !set.has(d));
    },
  },
});

export const { toggle, remove, clear, removeMany } = selectionSlice.actions;
export default selectionSlice.reducer;
