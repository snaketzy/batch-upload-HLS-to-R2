import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { api } from "./api";
import selectionReducer from "./selectionSlice";
import uploadReducer from "./uploadSlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    selection: selectionReducer,
    upload: uploadReducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
