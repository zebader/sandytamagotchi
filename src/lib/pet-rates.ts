function envNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

export type PetRates = {
  hungerRisePerHrAwake: number;
  hungerRisePerHrSleep: number;
  hygieneDropPerHr: number;
  funDropPerHrAwake: number;
  funDropPerHrSleep: number;
  restDropPerHrAwake: number;
  restGainPerHrSleep: number;
};

export function getPetRates(): PetRates {
  return {
    hungerRisePerHrAwake: envNumber("HUNGER_RISE_PER_HR_AWAKE", 5),
    hungerRisePerHrSleep: envNumber("HUNGER_RISE_PER_HR_SLEEP", 1),
    hygieneDropPerHr: envNumber("HYGIENE_DROP_PER_HR", 4),
    funDropPerHrAwake: envNumber("FUN_DROP_PER_HR_AWAKE", 5),
    funDropPerHrSleep: envNumber("FUN_DROP_PER_HR_SLEEP", 2),
    restDropPerHrAwake: envNumber("REST_DROP_PER_HR_AWAKE", 6),
    restGainPerHrSleep: envNumber("REST_GAIN_PER_HR_SLEEP", 8),
  };
}
