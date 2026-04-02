import { CosmosClient } from "@azure/cosmos";

const client = new CosmosClient(process.env.COSMOSDB_CONNECTION_STRING!);
const database = client.database("taskapp");

export const listsContainer = database.container("lists");
export const tasksContainer = database.container("tasks");
