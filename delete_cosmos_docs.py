"""
One-time script to delete documents from CosmosDB containers by ReportId.
Usage: pip install azure-cosmos && python delete_cosmos_docs.py
"""

from azure.cosmos import CosmosClient

# --- FILL THESE IN ---
CONNECTION_STRING = "<your-cosmos-connection-string>"
DATABASE_NAME = "<your-database-name>"

REPORT_IDS = [
    "cae0e3bc-d58b-47be-b39e-62474bd7916f",
    # Add 7 more ReportIds here
]

# Container name -> (query template, partition key field)
# Adjust partition_key_field to match each container's partition key path.
# If partition key IS the ReportId field, set it accordingly.
CONTAINERS = {
    "SharedViewDetails": ("SELECT * FROM c WHERE c.ReportId = @rid", "ReportId"),
    "SharedViews":       ("SELECT * FROM c WHERE c.ReportId = @rid", "ReportId"),
    "UserPersonalization": ("SELECT * FROM c WHERE c.ReportID = @rid", "ReportID"),
}


def main():
    client = CosmosClient.from_connection_string(CONNECTION_STRING)
    db = client.get_database_client(DATABASE_NAME)

    for container_name, (query_template, pk_field) in CONTAINERS.items():
        container = db.get_container_client(container_name)
        print(f"\n=== {container_name} ===")

        for rid in REPORT_IDS:
            params = [{"name": "@rid", "value": rid}]
            docs = list(container.query_items(query=query_template, parameters=params, enable_cross_partition_query=True))
            print(f"  ReportId {rid}: found {len(docs)} document(s)")

            for doc in docs:
                partition_value = doc.get(pk_field, doc.get("id"))
                container.delete_item(item=doc["id"], partition_key=partition_value)
                print(f"    Deleted {doc['id']}")

    print("\nDone.")


if __name__ == "__main__":
    main()
