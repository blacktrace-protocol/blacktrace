module github.com/blacktrace/settlement-service

go 1.24.1

require (
	github.com/NethermindEth/juno v0.14.0
	github.com/NethermindEth/starknet.go v0.14.0
	github.com/nats-io/nats.go v1.31.0
	golang.org/x/crypto v0.41.0
)

require (
	github.com/bits-and-blooms/bitset v1.24.0 // indirect
	github.com/consensys/gnark-crypto v0.18.0 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/deckarep/golang-set/v2 v2.8.0 // indirect
	github.com/fxamacker/cbor/v2 v2.9.0 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/holiman/uint256 v1.3.2 // indirect
	github.com/klauspost/compress v1.18.0 // indirect
	github.com/nats-io/nkeys v0.4.5 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/stretchr/testify v1.10.0 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	golang.org/x/net v0.43.0 // indirect
	golang.org/x/sys v0.35.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

// Force older juno version that works with Go 1.23
replace github.com/NethermindEth/juno => github.com/NethermindEth/juno v0.14.7
