import type { PetRates } from "./pet-rates";

export type PetState = {
  id: string;
  name: string;
  /** Need for food: 0 = full, 100 = starving. UI shows `100 - hunger` as “Satiated”. */
  hunger: number;
  hygiene: number;
  fun: number;
  /** Fatigue inverse of “energy”: high = rested, low = tired. UI label: Energy. */
  rest: number;
  isSleeping: boolean;
  /** Server anchor time for the stat row (ISO). Client simulates forward with `rates`. */
  updatedAt: string;
  /**
   * Server clock at the end of the request. Used to align the client "now" with the server
   * so in-tab simulation matches a full page reload.
   */
  serverTime: string;
  /** Decay rates in use on the server (keeps client display in sync with the same rules). */
  rates: PetRates;
};
