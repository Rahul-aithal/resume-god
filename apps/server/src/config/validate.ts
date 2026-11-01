import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { EnvironmentVariables } from "./environment";

/**
 * Bootstrap-time env validation for ConfigModule.forRoot({ validate }).
 * Coerces (PORT "3000" → 3000), applies class defaults, and aborts
 * startup with every violation reported.
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
