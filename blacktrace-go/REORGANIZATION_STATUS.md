# Folder Reorganization Status

## ✅ Completed

### Files Moved (with git history preserved):
- **Node service**: `node/*.go` → `services/node/`
- **Settlement service**: `settlement-service/main.go` → `services/settlement/`
- **Zcash connector**: `settlement-service/zcash/*.go` → `connectors/zcash/`
- **Configuration**: `docker-compose.yml`, `zcash.conf` → `config/`
- **Scripts**: `clean-restart.sh` → `scripts/`
- **Dockerfiles**: Root `Dockerfile` → `services/node/Dockerfile`

### Folders Created:
- `services/node/`
- `services/settlement/`
- `connectors/zcash/`
- `connectors/starknet/htlc-contract/`
- `config/`
- `scripts/`
- `tests/integration/`
- `examples/`

Total files reorganized: **19 files** (preserving git history)

## 🚧 TODO (Next Steps)

### 1. Update Import Paths
All Go files that import from `node/` need to be updated to `services/node/`:

```bash
# Files to update:
- services/node/*.go (update internal imports)
- services/settlement/main.go (if it imports node packages)
- cmd/*.go (update imports)
```

**Find and replace:**
- `"blacktrace-go/node"` → `"blacktrace/services/node"`
- `"blacktrace-go/settlement-service"` → `"blacktrace/services/settlement"`
- `"blacktrace-go/settlement-service/zcash"` → `"blacktrace/connectors/zcash"`

### 2. Update go.mod
Change module path from `blacktrace-go` to `blacktrace`:
```
module blacktrace
```

### 3. Update docker-compose.yml
Update build context paths:
```yaml
node-maker:
  build:
    context: ..
    dockerfile: services/node/Dockerfile

settlement-service:
  build:
    context: ..
    dockerfile: services/settlement/Dockerfile
```

### 4. Update Dockerfiles
Update COPY and WORKDIR paths to match new structure.

### 5. Create Connector Interface
Create `connectors/interface.go` with ChainConnector interface definition.

### 6. Move Starknet Contracts
```bash
git mv starknet-contracts/* connectors/starknet/htlc-contract/
```

### 7. Test Build
```bash
cd services/node && go build
cd ../settlement && go build
```

### 8. Test Docker Build
```bash
docker-compose -f config/docker-compose.yml build
```

### 9. Update Documentation
- Update README.md with new folder structure
- Update import examples in docs/

## 📁 Final Structure

```
blacktrace/
├── services/
│   ├── node/
│   └── settlement/
├── connectors/
│   ├── interface.go
│   ├── zcash/
│   └── starknet/
├── config/
│   ├── docker-compose.yml
│   └── zcash.conf
├── scripts/
│   └── clean-restart.sh
├── tests/
│   ├── api-test-suite.sh
│   └── integration/
├── docs/
├── cmd/
├── frontend/
└── examples/
```

## ⚠️ Known Issues

1. Build will fail until import paths are updated
2. Docker Compose won't work until paths are updated in config/docker-compose.yml
3. Some scripts may reference old paths

## 🔄 Commands to Complete Reorganization

```bash
# 1. Update import paths (use sed or find/replace in IDE)
find services cmd -name "*.go" -exec sed -i '' 's|blacktrace-go/node|blacktrace/services/node|g' {} +
find services cmd -name "*.go" -exec sed -i '' 's|blacktrace-go/settlement-service|blacktrace/services/settlement|g' {} +

# 2. Update go.mod
sed -i '' 's|module blacktrace-go|module blacktrace|g' go.mod

# 3. Update docker-compose.yml build contexts
# (Manual edit required)

# 4. Test build
cd services/node && go build
cd ../settlement && go build

# 5. Commit
git add -A
git commit -m "Complete folder reorganization with updated imports"
```

## 💡 Next Session

When ready to continue:
1. Run the commands above to update import paths
2. Update docker-compose.yml manually
3. Test build
4. Test docker-compose
5. Update documentation
6. Commit final reorganization
