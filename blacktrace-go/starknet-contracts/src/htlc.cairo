use starknet::ContractAddress;

#[starknet::interface]
trait IHTLC<TContractState> {
    fn lock(
        ref self: TContractState,
        hash_lock: felt252,
        receiver: ContractAddress,
        timeout: u64,
        amount: u256
    );
    fn claim(ref self: TContractState, secret: felt252);
    fn refund(ref self: TContractState);
    fn get_htlc_details(self: @TContractState) -> HTLCDetails;
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
    use super::{HTLCDetails, ContractAddress};
    use starknet::{get_caller_address, get_block_timestamp};
    use core::pedersen::pedersen;

    #[storage]
    struct Storage {
        hash_lock: felt252,
        sender: ContractAddress,
        receiver: ContractAddress,
        amount: u256,
        timeout: u64,
        claimed: bool,
        refunded: bool,
        locked: bool,
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
        sender: ContractAddress,
        #[key]
        receiver: ContractAddress,
        amount: u256,
        hash_lock: felt252,
        timeout: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Claimed {
        #[key]
        receiver: ContractAddress,
        secret: felt252,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Refunded {
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
            // Ensure HTLC hasn't been locked yet
            assert(!self.locked.read(), 'HTLC already locked');

            // Validate parameters
            assert(amount > 0, 'Amount must be positive');
            assert(timeout > get_block_timestamp(), 'Timeout must be in future');

            let caller = get_caller_address();

            // Store HTLC parameters
            self.hash_lock.write(hash_lock);
            self.sender.write(caller);
            self.receiver.write(receiver);
            self.amount.write(amount);
            self.timeout.write(timeout);
            self.locked.write(true);

            // Emit event
            self.emit(Locked {
                sender: caller,
                receiver,
                amount,
                hash_lock,
                timeout,
            });

            // Note: In production, transfer STRK tokens from sender to contract here
            // For now, we assume tokens are already in the contract
        }

        fn claim(ref self: ContractState, secret: felt252) {
            // Verify HTLC is locked
            assert(self.locked.read(), 'HTLC not locked');

            // Verify not already claimed or refunded
            assert(!self.claimed.read(), 'Already claimed');
            assert(!self.refunded.read(), 'Already refunded');

            // Verify caller is the receiver
            let caller = get_caller_address();
            assert(caller == self.receiver.read(), 'Only receiver can claim');

            // Verify secret matches hash_lock
            let computed_hash = pedersen(secret, 0);
            assert(computed_hash == self.hash_lock.read(), 'Invalid secret');

            // Verify timeout hasn't passed
            assert(get_block_timestamp() <= self.timeout.read(), 'Timeout passed');

            // Mark as claimed
            self.claimed.write(true);

            let amount = self.amount.read();

            // Emit event
            self.emit(Claimed {
                receiver: caller,
                secret,
                amount,
            });

            // Note: In production, transfer STRK tokens to receiver here
        }

        fn refund(ref self: ContractState) {
            // Verify HTLC is locked
            assert(self.locked.read(), 'HTLC not locked');

            // Verify not already claimed or refunded
            assert(!self.claimed.read(), 'Already claimed');
            assert(!self.refunded.read(), 'Already refunded');

            // Verify caller is the sender
            let caller = get_caller_address();
            assert(caller == self.sender.read(), 'Only sender can refund');

            // Verify timeout has passed
            assert(get_block_timestamp() > self.timeout.read(), 'Timeout not reached');

            // Mark as refunded
            self.refunded.write(true);

            let amount = self.amount.read();

            // Emit event
            self.emit(Refunded {
                sender: caller,
                amount,
            });

            // Note: In production, transfer STRK tokens back to sender here
        }

        fn get_htlc_details(self: @ContractState) -> HTLCDetails {
            HTLCDetails {
                hash_lock: self.hash_lock.read(),
                sender: self.sender.read(),
                receiver: self.receiver.read(),
                amount: self.amount.read(),
                timeout: self.timeout.read(),
                claimed: self.claimed.read(),
                refunded: self.refunded.read(),
            }
        }
    }
}
