import { integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const krc20IndexJobs = pgTable("krc20_index_jobs", {
  ticker: text("ticker").primaryKey(),
  status: text("status").notNull().default("indexing"),
  cursor: text("cursor"),
  processedOperations: integer("processed_operations").notNull().default(0),
  expectedHolders: integer("expected_holders"),
  finalHolderCount: integer("final_holder_count"),
  finalEligibleHolderCount: integer("final_eligible_holder_count"),
  excludedBurnAddresses: integer("excluded_burn_addresses").notNull().default(0),
  lastError: text("last_error"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const krc20Balances = pgTable("krc20_balances", {
  ticker: text("ticker").notNull(),
  address: text("address").notNull(),
  balance: numeric("balance", { precision: 78, scale: 0 }).notNull().default("0"),
}, (table) => ({
  pk: primaryKey({ columns: [table.ticker, table.address] }),
}));

export type Krc20IndexJob = typeof krc20IndexJobs.$inferSelect;