import type { SupportedProvider } from "../services/model.constants.js";

export interface ProviderConfig {
  provider: SupportedProvider;
  modelName: string;
}
