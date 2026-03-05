import { ensureMasterDataSchema } from "./masterDataSchema.js";
import { ensureOrdersSchema } from "./ordersSchema.js";
import { ensureIngestionSchema } from "./ingestionSchema.js";

const schemaSteps = [
  ensureMasterDataSchema,
  ensureOrdersSchema,
  ensureIngestionSchema,
];

const ensureAppSchema = async (pool) => {
  if (!pool) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const step of schemaSteps) {
      await step(client);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export { ensureAppSchema };
