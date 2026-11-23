/**
 * The sign-in drawer's views as a pure state machine: the method list and the wallet list (search
 * and chain family). Back from the wallets returns to the methods; closing resets, so the next
 * opening starts from the methods with an empty search. (Leaving for Sanctum is useSignIn's state.)
 */
import type { ChainFamily } from "@inverus/connect";

export type DrawerView = "methods" | "wallets";

export interface DrawerState {
  view: DrawerView;
  /** Which way the last view change went, for the transition. */
  direction: "forward" | "back" | null;
  query: string;
  family: ChainFamily | "all";
}

export type DrawerAction =
  | { type: "reset" | "wallets" | "back" }
  | { type: "search"; query: string }
  | { type: "family"; family: ChainFamily | "all" };

export const initialDrawerState: DrawerState = { view: "methods", direction: null, query: "", family: "all" };

export function drawerReducer(state: DrawerState, action: DrawerAction): DrawerState {
  switch (action.type) {
    case "reset":
      return initialDrawerState;
    case "wallets":
      return { ...state, view: "wallets", direction: "forward", query: "", family: "all" };
    case "back":
      return state.view === "methods" ? state : { ...state, view: "methods", direction: "back" };
    case "search":
      return { ...state, query: action.query.slice(0, 64) };
    case "family":
      return { ...state, family: action.family };
  }
}
