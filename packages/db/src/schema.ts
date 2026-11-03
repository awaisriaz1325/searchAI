import {
  bigint,
  char,
  customType,
  doublePrecision,
  halfvec,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { PORTALS } from '@searchai/core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const portalEnum = pgEnum('portal', PORTALS);

/** Mirrors migrations/0001_init.sql; the SQL file is the source of truth for DDL. */
export const listings = pgTable('listings', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  portal: portalEnum('portal').notNull(),
  ownerId: uuid('owner_id').notNull(),
  status: text('status', { enum: ['draft', 'published'] }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  lang: text('lang').notNull(),
  priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).notNull().default('EUR'),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  facts: jsonb('facts').notNull(),
  factsSource: text('facts_source', { enum: ['truth', 'extracted'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  fts: tsvector('fts'),
});

export const listingEmbeddings = pgTable('listing_embeddings', {
  listingId: bigint('listing_id', { mode: 'number' })
    .primaryKey()
    .references(() => listings.id, { onDelete: 'cascade' }),
  portal: portalEnum('portal').notNull(),
  model: text('model').notNull(),
  modelVersion: text('model_version').notNull(),
  embedding: halfvec('embedding', { dimensions: 384 }).notNull(),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const places = pgTable('places', {
  nameNorm: text('name_norm').primaryKey(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  country: char('country', { length: 2 }).notNull(),
});
