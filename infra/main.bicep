targetScope = 'resourceGroup'

@description('Primary location for resources')
param location string = resourceGroup().location

@description('Static Web App location (Free tier available in: centralus, eastus2, westus2, westeurope, eastasia)')
param swaLocation string = 'centralus'

var resourceToken = uniqueString(resourceGroup().id)
var cosmosAccountName = 'cosmos-${resourceToken}'
var swaName = 'swa-taskapp-${resourceToken}'

// ── Cosmos DB (Free Tier: 1000 RU/s + 25 GB free) ──

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    locations: [
      {
        locationName: location
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

// ── Static Web App (Free Tier) ──

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

resource swaAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    COSMOSDB_CONNECTION_STRING: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
  }
}

// ── Outputs ──

output STATIC_WEB_APP_NAME string = staticWebApp.name
output STATIC_WEB_APP_URL string = 'https://${staticWebApp.properties.defaultHostname}'
output COSMOS_ACCOUNT_NAME string = cosmosAccount.name
