use starknet::ContractAddress;

// STRK Token Interface (ERC20)
#[starknet::interface]
trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256
    ) -> bool;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
}

#[starknet::interface]
trait IHTLC<TContractState> {
    fn lock(
        ref self: TContractState,
        hash_lock: felt252,
        receiver: ContractAddress,
        timeout: u64,
        amount: u256
    );
    fn claim(ref self: TContractState, hash_lock: felt252, secret: felt252);
    fn refund(ref self: TContractState, hash_lock: felt252);
    fn get_htlc_details(self: @TContractState, hash_lock: felt252) -> HTLCDetails;
    fn get_htlc_count(self: @TContractState) -> u64;
}

#[derive(Drop, Serde, starknet::Store)]
struct HTLCDetails {
    hash_lock: felt252,
    sender: ContractAddress,
    receiver: ContractAddress,
    amount: u256,
    timeout: u64,
    claimed: bool,
    refunded: bool,
}

#[starknet::contract]
mod HTLC {
    use super::{HTLCDetails, ContractAddress, IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{get_caller_address, get_block_timestamp, get_contract_address};
    use core::pedersen::pedersen;

    // STRK token address on Starknet devnet
    const STRK_TOKEN_ADDRESS: felt252 = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d;

    // Zero address constant for checking if HTLC exists
    const ZERO_ADDRESS: felt252 = 0;

    #[storage]
    struct Storage {
        // Map from hash_lock to HTLC details
        htlc_senders: LegacyMap<felt252, ContractAddress>,
        htlc_receivers: LegacyMap<felt252, ContractAddress>,
        htlc_amounts: LegacyMap<felt252, u256>,
        htlc_timeouts: LegacyMap<felt252, u64>,
        htlc_claimed: LegacyMap<felt252, bool>,
        htlc_refunded: LegacyMap<felt252, bool>,
        // Counter for total HTLCs created
        htlc_count: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Locked: Locked,
        Claimed: Claimed,
        Refunded: Refunded,
    }

    #[derive(Drop, starknet::Event)]
    struct Locked {
        #[key]
        hash_lock: felt252,
        #[key]
        sender: ContractAddress,
        #[key]
        receiver: ContractAddress,
        amount: u256,
        timeout: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Claimed {
        #[key]
        hash_lock: felt252,
        #[key]
        receiver: ContractAddress,
        secret: felt252,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Refunded {
        #[key]
        hash_lock: felt252,
        #[key]
        sender: ContractAddress,
        amount: u256,
    }

    #[abi(embed_v0)]
    impl HTLCImpl of super::IHTLC<ContractState> {
        fn lock(
            ref self: ContractState,
            hash_lock: felt252,
            receiver: ContractAddress,
            timeout: u64,
            amount: u256
        ) {
            // Ensure this hash_lock hasn't been used before
            let existing_sender: ContractAddress = self.htlc_senders.read(hash_lock);
            assert(existing_sender.into() == ZERO_ADDRESS, 'HTLC already exists');

            // Validate parameters
            assert(amount > 0, 'Amount must be positive');
            assert(timeout > get_block_timestamp(), 'Timeout must be in future');

            let caller = get_caller_address();
            let contract_address = get_contract_address();

            // Transfer STRK tokens from sender to this contract
            let strk_token = IERC20Dispatcher {
                contract_address: STRK_TOKEN_ADDRESS.try_into().unwrap()
            };

            let transfer_success = strk_token.transfer_from(caller, contract_address, amount);
            assert(transfer_success, 'STRK transfer failed');

            // Store HTLC parameters in maps
            self.htlc_senders.write(hash_lock, caller);
            self.htlc_receivers.write(hash_lock, receiver);
            self.htlc_amounts.write(hash_lock, amount);
            self.htlc_timeouts.write(hash_lock, timeout);
            self.htlc_claimed.write(hash_lock, false);
            self.htlc_refunded.write(hash_lock, false);

            // Increment counter
            let current_count = self.htlc_count.read();
            self.htlc_count.write(current_count + 1);

            // Emit event
            self.emit(Locked {
                hash_lock,
                sender: caller,
                receiver,
                amount,
                timeout,
            });
        }

        fn claim(ref self: ContractState, hash_lock: felt252, secret: felt252) {
            // Verify HTLC exists
            let sender: ContractAddress = self.htlc_senders.read(hash_lock);
            assert(sender.into() != ZERO_ADDRESS, 'HTLC not found');

            // Verify not already claimed or refunded
            assert(!self.htlc_claimed.read(hash_lock), 'Already claimed');
            assert(!self.htlc_refunded.read(hash_lock), 'Already refunded');

            // Verify caller is the receiver
            let caller = get_caller_address();
            let receiver = self.htlc_receivers.read(hash_lock);
            assert(caller == receiver, 'Only receiver can claim');

            // Verify secret matches hash_lock
            let computed_hash = pedersen(secret, 0);
            assert(computed_hash == hash_lock, 'Invalid secret');

            // Verify timeout hasn't passed
            let timeout = self.htlc_timeouts.read(hash_lock);
            assert(get_block_timestamp() <= timeout, 'Timeout passed');

            // Mark as claimed
            self.htlc_claimed.write(hash_lock, true);

            let amount = self.htlc_amounts.read(hash_lock);

            // Transfer STRK tokens to receiver
            let strk_token = IERC20Dispatcher {
                contract_address: STRK_TOKEN_ADDRESS.try_into().unwrap()
            };

            let transfer_success = strk_token.transfer(caller, amount);
            assert(transfer_success, 'STRK transfer failed');

            // Emit event
            self.emit(Claimed {
                hash_lock,
                receiver: caller,
                secret,
                amount,
            });
        }

        fn refund(ref self: ContractState, hash_lock: felt252) {
            // Verify HTLC exists
            let sender: ContractAddress = self.htlc_senders.read(hash_lock);
            assert(sender.into() != ZERO_ADDRESS, 'HTLC not found');

            // Verify not already claimed or refunded
            assert(!self.htlc_claimed.read(hash_lock), 'Already claimed');
            assert(!self.htlc_refunded.read(hash_lock), 'Already refunded');

            // Verify caller is the sender
            let caller = get_caller_address();
            assert(caller == sender, 'Only sender can refund');

            // Verify timeout has passed
            let timeout = self.htlc_timeouts.read(hash_lock);
            assert(get_block_timestamp() > timeout, 'Timeout not reached');

            // Mark as refunded
            self.htlc_refunded.write(hash_lock, true);

            let amount = self.htlc_amounts.read(hash_lock);

            // Transfer STRK tokens back to sender
            let strk_token = IERC20Dispatcher {
                contract_address: STRK_TOKEN_ADDRESS.try_into().unwrap()
            };

            let transfer_success = strk_token.transfer(caller, amount);
            assert(transfer_success, 'STRK transfer failed');

            // Emit event
            self.emit(Refunded {
                hash_lock,
                sender: caller,
                amount,
            });
        }

        fn get_htlc_details(self: @ContractState, hash_lock: felt252) -> HTLCDetails {
            HTLCDetails {
                hash_lock,
                sender: self.htlc_senders.read(hash_lock),
                receiver: self.htlc_receivers.read(hash_lock),
                amount: self.htlc_amounts.read(hash_lock),
                timeout: self.htlc_timeouts.read(hash_lock),
                claimed: self.htlc_claimed.read(hash_lock),
                refunded: self.htlc_refunded.read(hash_lock),
            }
        }

        fn get_htlc_count(self: @ContractState) -> u64 {
            self.htlc_count.read()
        }
    }
}
