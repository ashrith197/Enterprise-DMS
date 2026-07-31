const fs = require('fs');
const path = require('path');

const manifest = {
  "gateway": ["identity.proto", "organization.proto", "branch.proto", "team.proto", "document.proto", "transfer.proto"],
  "identity-service": [],
  "organization-service": ["identity.proto"],
  "branch-service": ["organization.proto"],
  "team-service": ["branch.proto", "organization.proto"],
  "document-service": ["organization.proto", "branch.proto", "team.proto"],
  "transfer-service": ["team.proto", "branch.proto", "organization.proto"],
  "notification-service": [],
  "audit-service": []
};

// Map service names to their own proto files
const serviceOwnProtos = {
  "gateway": null,
  "identity-service": "identity.proto",
  "organization-service": "organization.proto",
  "branch-service": "branch.proto",
  "team-service": "team.proto",
  "document-service": "document.proto",
  "transfer-service": "transfer.proto",
  "notification-service": null,
  "audit-service": null
};

const contractsDir = path.join(__dirname, '..', 'contracts');
let totalCopied = 0;

console.log('🔄 Starting proto sync...\n');

Object.entries(manifest).forEach(([service, protos]) => {
  const serviceDir = path.join(__dirname, '..', service);
  const protoDir = path.join(serviceDir, 'proto');

  // Check if service directory exists
  if (!fs.existsSync(serviceDir)) {
    console.log(`⚠️  Service directory not found: ${service} - skipping`);
    return;
  }

  // Create proto directory if it doesn't exist
  if (!fs.existsSync(protoDir)) {
    fs.mkdirSync(protoDir, { recursive: true });
  }

  // Copy dependency protos
  protos.forEach(proto => {
    const source = path.join(contractsDir, proto);
    const dest = path.join(protoDir, proto);

    if (fs.existsSync(source)) {
      fs.copyFileSync(source, dest);
      console.log(`✓ Copied ${proto} → ${service}/proto/`);
      totalCopied++;
    } else {
      console.log(`✗ Source not found: ${proto}`);
    }
  });

  // Copy service's own proto file if it has one
  const ownProto = serviceOwnProtos[service];
  if (ownProto && !protos.includes(ownProto)) {
    const source = path.join(contractsDir, ownProto);
    const dest = path.join(protoDir, ownProto);

    if (fs.existsSync(source)) {
      fs.copyFileSync(source, dest);
      console.log(`✓ Copied ${ownProto} → ${service}/proto/ (own service proto)`);
      totalCopied++;
    }
  }
});

console.log(`\n✅ Sync complete! Total files copied: ${totalCopied}`);
