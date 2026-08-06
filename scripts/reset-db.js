const fs = require("fs");
const path = require("path");

const dataDir = path.join(process.cwd(), "data");
const files = [
  "agri-soft-pro.dev.db",
  "agri-soft-pro.dev.db-wal",
  "agri-soft-pro.dev.db-shm",
  "agri-soft-pro.db",
  "agri-soft-pro.db-wal",
  "agri-soft-pro.db-shm",
];

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let removed = 0;
for (const name of files) {
  const full = path.join(dataDir, name);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
    removed += 1;
    console.log("removed", name);
  }
}

console.log(removed ? `Reset complete (${removed} files). Run npm run dev to reseed.` : "No DB files found. Run npm run dev to create + seed.");
