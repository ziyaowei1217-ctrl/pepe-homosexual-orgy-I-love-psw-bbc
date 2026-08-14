import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AuthModule } from "./auth/auth.module";
import { ApplicationsModule } from "./applications/applications.module";
import { AuditModule } from "./audit/audit.module";
import { getJwtSecret } from "./config/env";
import { DealThreadsModule } from "./deal-threads/deal-threads.module";
import { DealRoomsModule } from "./deal-rooms/deal-rooms.module";
import { DemoPaymentsModule } from "./demo-payments/demo-payments.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthModule } from "./health/health.module";
import { ListingMediaModule } from "./listing-media/listing-media.module";
import { ListingsModule } from "./listings/listings.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RoommateConversationsModule } from "./roommate-conversations/roommate-conversations.module";
import { RoommateTeamsModule } from "./roommate-teams/roommate-teams.module";
import { RoommatesModule } from "./roommates/roommates.module";
import { TripsModule } from "./trips/trips.module";
import { TrustModule } from "./trust/trust.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: "7d" }
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    DemoPaymentsModule,
    ApplicationsModule,
    HealthModule,
    DealThreadsModule,
    DealRoomsModule,
    UsersModule,
    MarketplaceModule,
    ListingsModule,
    ListingMediaModule,
    RoommateConversationsModule,
    RoommateTeamsModule,
    RoommatesModule,
    GroupsModule,
    TripsModule,
    TrustModule
  ]
})
export class AppModule {}
