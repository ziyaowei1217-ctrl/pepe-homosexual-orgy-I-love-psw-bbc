import { ServiceUnavailableException } from "@nestjs/common";

export const MAX_DISCOVERABLE_ROOMMATE_PROFILES = 5_000;

export function assertRoommateDiscoveryCapacity(length: number) {
  if (length > MAX_DISCOVERABLE_ROOMMATE_PROFILES) {
    throw new ServiceUnavailableException({
      code: "DISCOVERY_CAPACITY_EXCEEDED",
      message: "Roommate discovery is temporarily unavailable because the supported catalog capacity was exceeded"
    });
  }
}
