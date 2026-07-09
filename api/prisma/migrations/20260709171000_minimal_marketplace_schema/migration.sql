-- CreateTable
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "school" TEXT,
    "city" TEXT,
    "role" TEXT NOT NULL DEFAULT 'renter',
    "edu_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "wechat" TEXT,
    "instagram" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_role_check" CHECK ("role" IN ('renter', 'lister', 'both'))
);

-- CreateTable
CREATE TABLE "roommate_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "school" TEXT,
    "city" TEXT,
    "budget_min" INTEGER,
    "budget_max" INTEGER,
    "move_in_date" DATE,
    "move_out_date" DATE,
    "preferred_neighborhoods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "room_type" TEXT,
    "cleanliness" TEXT,
    "sleep_schedule" TEXT,
    "smoking" TEXT,
    "pets" TEXT,
    "guests" TEXT,
    "intro" TEXT,
    "looking_for" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roommate_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roommate_profiles_budget_check" CHECK (
        ("budget_min" IS NULL OR "budget_min" >= 0) AND
        ("budget_max" IS NULL OR "budget_max" >= 0) AND
        ("budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max")
    ),
    CONSTRAINT "roommate_profiles_dates_check" CHECK (
        "move_out_date" IS NULL OR "move_in_date" IS NULL OR "move_out_date" >= "move_in_date"
    ),
    CONSTRAINT "roommate_profiles_room_type_check" CHECK (
        "room_type" IS NULL OR "room_type" IN ('private_room', 'shared_room', 'entire_place')
    ),
    CONSTRAINT "roommate_profiles_status_check" CHECK ("status" IN ('active', 'hidden', 'matched'))
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "listing_type" TEXT NOT NULL,
    "property_type" TEXT NOT NULL,
    "room_type" TEXT NOT NULL,
    "price_monthly" INTEGER NOT NULL,
    "deposit_amount" INTEGER,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT,
    "school_nearby" TEXT,
    "address_approx" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "move_in_date" DATE NOT NULL,
    "move_out_date" DATE,
    "flexible_dates" BOOLEAN NOT NULL DEFAULT false,
    "bedrooms" DECIMAL(4,1) NOT NULL,
    "bathrooms" DECIMAL(4,1) NOT NULL,
    "furnished" BOOLEAN NOT NULL DEFAULT false,
    "utilities_included" BOOLEAN NOT NULL DEFAULT false,
    "laundry" BOOLEAN NOT NULL DEFAULT false,
    "parking" BOOLEAN NOT NULL DEFAULT false,
    "pets_allowed" BOOLEAN NOT NULL DEFAULT false,
    "lease_approved" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listings_price_check" CHECK (
        "price_monthly" > 0 AND ("deposit_amount" IS NULL OR "deposit_amount" >= 0)
    ),
    CONSTRAINT "listings_dates_check" CHECK (
        "move_out_date" IS NULL OR "move_out_date" >= "move_in_date"
    ),
    CONSTRAINT "listings_location_check" CHECK (
        ("lat" IS NULL OR ("lat" >= -90 AND "lat" <= 90)) AND
        ("lng" IS NULL OR ("lng" >= -180 AND "lng" <= 180))
    ),
    CONSTRAINT "listings_listing_type_check" CHECK (
        "listing_type" IN ('sublet', 'lease_takeover', 'roommate_needed')
    ),
    CONSTRAINT "listings_property_type_check" CHECK (
        "property_type" IN ('apartment', 'house', 'studio')
    ),
    CONSTRAINT "listings_room_type_check" CHECK (
        "room_type" IN ('private_room', 'shared_room', 'entire_place')
    ),
    CONSTRAINT "listings_status_check" CHECK (
        "status" IN ('draft', 'active', 'rented', 'hidden')
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_school_city_idx" ON "profiles"("school", "city");

-- CreateIndex
CREATE INDEX "roommate_profiles_user_id_status_idx" ON "roommate_profiles"("user_id", "status");

-- CreateIndex
CREATE INDEX "roommate_profiles_city_school_status_idx" ON "roommate_profiles"("city", "school", "status");

-- CreateIndex
CREATE INDEX "roommate_profiles_budget_min_budget_max_idx" ON "roommate_profiles"("budget_min", "budget_max");

-- CreateIndex
CREATE INDEX "listings_owner_id_status_updated_at_idx" ON "listings"("owner_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "listings_city_neighborhood_price_monthly_idx" ON "listings"("city", "neighborhood", "price_monthly");

-- CreateIndex
CREATE INDEX "listings_listing_type_room_type_status_idx" ON "listings"("listing_type", "room_type", "status");

-- AddForeignKey
ALTER TABLE "roommate_profiles" ADD CONSTRAINT "roommate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
