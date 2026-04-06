targetScope = 'resourceGroup'

@description('Primary location for resources')
param location string = resourceGroup().location

@description('Static Web App location (Free tier available in: centralus, eastus2, westus2, westeurope, eastasia)')
param swaLocation string = 'centralus'

var resourceToken = uniqueString(resourceGroup().id)
var cosmosAccountName = 'cosmos-${resourceToken}'
var swa1Name = 'swa-taskapp1-${resourceToken}'
var swa2Name = 'swa-taskapp2-${resourceToken}'

// ── Cosmos DB (Free Tier: 1000 RU/s + 25 GB free) ──
// Colocated with SWA for minimal API-to-DB latency

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: swaLocation
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    locations: [
      {
        locationName: swaLocation
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'taskapp'
  properties: {
    resource: { id: 'taskapp' }
    options: { throughput: 1000 }
  }
}

resource listsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'lists'
  properties: {
    resource: {
      id: 'lists'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

resource tasksContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'tasks'
  properties: {
    resource: {
      id: 'tasks'
      partitionKey: { paths: ['/listId'], kind: 'Hash' }
    }
  }
}

// ── Static Web App 1 (Free Tier) — User 1 ──

resource staticWebApp1 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swa1Name
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

resource swa1AppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp1
  name: 'appsettings'
  properties: {
    COSMOSDB_CONNECTION_STRING: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
    TENANT_ID: 'user1'
  }
}

// ── Static Web App 2 (Free Tier) — User 2 ──

resource staticWebApp2 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swa2Name
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

resource swa2AppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp2
  name: 'appsettings'
  properties: {
    COSMOSDB_CONNECTION_STRING: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
    TENANT_ID: 'user2'
  }
}

// ── Outputs ──

output SWA1_NAME string = staticWebApp1.name
output SWA1_URL string = 'https://${staticWebApp1.properties.defaultHostname}'
output SWA2_NAME string = staticWebApp2.name
output SWA2_URL string = 'https://${staticWebApp2.properties.defaultHostname}'
output COSMOS_ACCOUNT_NAME string = cosmosAccount.name
