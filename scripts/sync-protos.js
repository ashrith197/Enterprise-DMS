const fs = require('fs');
const path = require('path');

const CONTRACTS_DIR = path.join(__dirname, '..', 'contracts');

// Manifest: which services need which proto files
const manifest = {
  'identity-service': ['identity.proto', 'organization.proto'],
  'organization-service': ['identity.proto', 'organization.proto'],
  'branch-service': ['identity.proto', 'organization.proto', 'branch.proto'],
  'team-service': ['identity.proto', 'organization.proto', 'branch.proto', 'team.proto'],
  'document-service': ['identity.proto', 'organization.proto', 'branch.proto', 'team.proto', 'document.proto'],
  'transfer-service': ['identity.proto', 'organization.proto', 'branch.proto', 'team.proto', 'document.proto', 'transfer.proto'],
  'gateway': ['identity.proto', 'organization.proto', 'branch.proto', 'team.proto', 'document.proto', 'transfer.proto'],
  'notification-service': [],
  'audit-service': []
};

function syncProtos() {
  console.log('🔄 Starting proto sync...\n');

  for (const [service, protoFiles] of Object.entries(manifest)) {
    const serviceProtoDir = path.join(__dirname, '..', service, 'proto');

    // Create proto directory if it doesn't exist
    if (!fs.existsSync(serviceProtoDir)) {
      fs.mkdirSync(serviceProtoDir, { recursive: true });
    }

    // Copy each proto file
    for (const protoFile of protoFiles) {
      const sourcePath = path.join(CONTRACTS_DIR, protoFile);
      const destPath = path.join(serviceProtoDir, protoFile);

      if (!fs.existsSync(sourcePath)) {
        console.log(`⚠️  Warning: ${protoFile} not found in contracts/`);
        continue;
      }

      fs.copyFileSync(sourcePath, destPath);
      console.log(`✅ ${service}/proto/${protoFile}`);
    }
  }

  console.log('\n✨ Proto sync complete!');
}

syncProtos();
